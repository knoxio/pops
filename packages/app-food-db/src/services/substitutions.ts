/**
 * Substitutions are directed edges between ingredients (or variants).
 * A bidirectional sub is two rows; the schema makes no attempt to link them.
 * Edges are either `global` (apply anywhere) or `recipe`-scoped (override
 * the global edge for one recipe).
 *
 * The service layer enforces three rules the schema cannot:
 *   1. Self-substitution (`from = to` on the same side) → `CannotSubstituteSelf`.
 *      The xor CHECKs make this impossible to express in pure SQL without
 *      exploding into four cases.
 *   2. `context_tags` is JSON-encoded. Callers pass arrays.
 *   3. Scope/recipe coherence is also enforced by CHECK, but the service
 *      normalises null/undefined before INSERT so callers can't trip it.
 */
import { and, eq } from 'drizzle-orm';

import { CannotSubstituteSelf } from '../errors.js';
import { substitutions, type SubstitutionRow } from '../schema.js';
import { expectRow, type FoodDb } from './internal.js';

export type SubstitutionScope = 'global' | 'recipe';

/**
 * Reference to one side of a substitution edge. Exactly one of
 * `ingredientId` or `variantId` must be set — the row-level XOR CHECK
 * mirrors this.
 */
export interface SubstitutionEndpoint {
  ingredientId?: number;
  variantId?: number;
}

export interface CreateSubstitutionInput {
  from: SubstitutionEndpoint;
  to: SubstitutionEndpoint;
  ratio?: number;
  contextTags?: readonly string[];
  scope?: SubstitutionScope;
  recipeId?: number | null;
  notes?: string | null;
}

/** The contextTags JSON column parsed back into an array. */
export interface SubstitutionView extends Omit<SubstitutionRow, 'contextTags'> {
  contextTags: readonly string[];
}

function assertEndpointShape(side: 'from' | 'to', endpoint: SubstitutionEndpoint): void {
  const hasIng = endpoint.ingredientId != null;
  const hasVar = endpoint.variantId != null;
  if (hasIng === hasVar) {
    throw new Error(
      `Substitution "${side}" must set exactly one of { ingredientId, variantId } — got ingredientId=${endpoint.ingredientId ?? 'null'}, variantId=${endpoint.variantId ?? 'null'}`
    );
  }
}

function assertNotSelfSubstitution(from: SubstitutionEndpoint, to: SubstitutionEndpoint): void {
  if (from.ingredientId != null && to.ingredientId === from.ingredientId) {
    throw new CannotSubstituteSelf('ingredient', from.ingredientId);
  }
  if (from.variantId != null && to.variantId === from.variantId) {
    throw new CannotSubstituteSelf('variant', from.variantId);
  }
}

function parseContextTags(raw: string): readonly string[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`context_tags is not a JSON array: ${raw}`);
  }
  return parsed.map((value, idx) => {
    if (typeof value !== 'string') {
      throw new Error(`context_tags[${idx}] is not a string: ${JSON.stringify(value)}`);
    }
    return value;
  });
}

function rowToView(row: SubstitutionRow): SubstitutionView {
  return { ...row, contextTags: parseContextTags(row.contextTags) };
}

function resolveScope(input: CreateSubstitutionInput): {
  scope: SubstitutionScope;
  recipeId: number | null;
} {
  const scope: SubstitutionScope = input.scope ?? 'global';
  const recipeId = scope === 'recipe' ? (input.recipeId ?? null) : null;
  if (scope === 'recipe' && recipeId == null) {
    throw new Error('Substitution with scope="recipe" requires recipeId');
  }
  return { scope, recipeId };
}

export function createSubstitution(db: FoodDb, input: CreateSubstitutionInput): SubstitutionView {
  assertEndpointShape('from', input.from);
  assertEndpointShape('to', input.to);
  assertNotSelfSubstitution(input.from, input.to);
  const { scope, recipeId } = resolveScope(input);
  const rows = db
    .insert(substitutions)
    .values({
      fromIngredientId: input.from.ingredientId ?? null,
      fromVariantId: input.from.variantId ?? null,
      toIngredientId: input.to.ingredientId ?? null,
      toVariantId: input.to.variantId ?? null,
      ratio: input.ratio ?? 1,
      contextTags: JSON.stringify(input.contextTags ?? []),
      scope,
      recipeId,
      notes: input.notes ?? null,
    })
    .returning()
    .all();
  const row = expectRow(rows, 'createSubstitution');
  return rowToView(row);
}

export function deleteSubstitution(db: FoodDb, id: number): void {
  db.delete(substitutions).where(eq(substitutions.id, id)).run();
}

/**
 * Delete every recipe-scoped substitution attached to a recipe. Used by
 * `deleteRecipe` so the transaction can clean up before the recipe row
 * is removed. Global subs are not touched.
 */
export function deleteRecipeScopedSubstitutions(db: FoodDb, recipeId: number): void {
  db.delete(substitutions)
    .where(and(eq(substitutions.scope, 'recipe'), eq(substitutions.recipeId, recipeId)))
    .run();
}
