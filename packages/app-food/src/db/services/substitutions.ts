/**
 * Substitution services — PRD-109.
 *
 * Substitutions are directed edges between ingredients (or variants). A
 * bidirectional sub is two rows; the schema makes no attempt to link them.
 * Edges are either `global` (apply anywhere) or `recipe`-scoped (override
 * the global edge for one recipe).
 *
 * The service layer enforces three rules that the schema cannot:
 *   1. Self-substitution (`from = to` on the same side) is rejected with
 *      `CannotSubstituteSelf`. The xor CHECKs make it impossible to express
 *      this in pure SQL without exploding into four cases.
 *   2. `context_tags` is stored as a JSON-encoded array of strings. Callers
 *      pass arrays; the service serialises via `JSON.stringify`.
 *   3. Scope/recipe coherence (recipe-scoped → recipe_id present, global →
 *      recipe_id absent) is also enforced at the schema level, but the
 *      service normalises null/undefined before INSERT so the CHECK never
 *      fires from a caller mistake.
 *
 * Query helpers (cook-time sub lookup, plan-time graph walk) live in Epic 06.
 */
import { and, eq, sql } from 'drizzle-orm';

import { CannotSubstituteSelf } from '../errors';
import { substitutions, type SubstitutionRow } from '../schema';
import { expectRow, type FoodDb } from './internal';

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

export interface ListSubstitutionsInput {
  fromIngredientId?: number;
  fromVariantId?: number;
  scope?: SubstitutionScope;
  recipeId?: number;
  contextTag?: string;
}

export function listSubstitutions(
  db: FoodDb,
  input: ListSubstitutionsInput = {}
): SubstitutionView[] {
  const filters = [];
  if (input.fromIngredientId !== undefined) {
    filters.push(eq(substitutions.fromIngredientId, input.fromIngredientId));
  }
  if (input.fromVariantId !== undefined) {
    filters.push(eq(substitutions.fromVariantId, input.fromVariantId));
  }
  if (input.scope !== undefined) {
    filters.push(eq(substitutions.scope, input.scope));
  }
  if (input.recipeId !== undefined) {
    filters.push(eq(substitutions.recipeId, input.recipeId));
  }
  if (input.contextTag !== undefined) {
    // json_each(context_tags) WHERE value = :tag
    filters.push(
      sql`EXISTS (SELECT 1 FROM json_each(${substitutions.contextTags}) WHERE value = ${input.contextTag})`
    );
  }
  const q = db.select().from(substitutions);
  const rows = filters.length > 0 ? q.where(and(...filters)).all() : q.all();
  return rows.map(rowToView);
}

export interface UpdateSubstitutionInput {
  ratio?: number;
  contextTags?: readonly string[];
  notes?: string | null;
}

export function updateSubstitution(
  db: FoodDb,
  id: number,
  input: UpdateSubstitutionInput
): SubstitutionView {
  const patch: Record<string, unknown> = {};
  if (input.ratio !== undefined) patch['ratio'] = input.ratio;
  if (input.contextTags !== undefined) patch['contextTags'] = JSON.stringify(input.contextTags);
  if (input.notes !== undefined) patch['notes'] = input.notes;
  const rows = db
    .update(substitutions)
    .set(patch)
    .where(eq(substitutions.id, id))
    .returning()
    .all();
  return rowToView(expectRow(rows, `updateSubstitution(${id})`));
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
