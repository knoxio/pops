/**
 * Shared per-line substitution resolver — PRD-150.
 *
 * Canonical home for the substitution-resolution logic that PRD-150's
 * solver and PRD-149's cook-time picker both consume. Reads PRD-109's
 * `substitutions` table with the override semantics carried forward
 * from PRD-149:
 *
 *   - A line is identified by its `(ingredientId, variantId,
 *     prepStateId)` triple. Subs match when their `from` side equals
 *     the line's ingredient OR variant side (ingredient match implies
 *     "applies to any variant of this ingredient"; variant-side match
 *     pins to that variant).
 *   - `scope = 'recipe'` rows override `scope = 'global'` rows for the
 *     same `(from, to)` pair within that recipe. Other global edges
 *     out of the same `from` are unaffected.
 *   - Context tags follow PRD-109's OR-overlap rule: an empty
 *     `context_tags` array is a wildcard; otherwise the sub matches
 *     iff at least one of its tags overlaps the recipe's `recipe_tags`.
 *
 * The public surface is split into three layers:
 *
 *   - `loadSubstitutionsIndex(db, recipeIds?)` — one-shot bulk load of
 *     every global sub + every recipe-scoped sub for the given recipe
 *     IDs (omit = every recipe-scoped sub in the table). The solver
 *     calls this once per request and walks every line through the
 *     in-memory index; PRD-149's per-line procedure passes a single
 *     recipe ID.
 *   - `resolveCandidatesForLine(index, ctx)` — pure function that takes
 *     the prebuilt index plus a line context and returns the ordered
 *     candidate set after scope override + context-tag filtering.
 *   - `loadBatchInventory(db)` — bulk pantry snapshot keyed by
 *     `(variantId, prepStateId|null)` so callers can score candidates
 *     without re-querying `batches` per line.
 */
import { and, isNull, sql } from 'drizzle-orm';

import { batches, substitutions, type FoodDb } from '@pops/app-food-db';

export type SubstitutionScope = 'global' | 'recipe';

/** Bucket of pantry batches for one `(variantId, prepStateId|null)` key. */
export interface BatchInventoryEntry {
  /** Sum of `qty_remaining` across every non-deleted, non-empty batch. */
  totalQty: number;
  unit: 'g' | 'ml' | 'count';
}

/** Snapshot of every active batch indexed by `(variantId, prepStateId|null)`. */
export interface BatchInventory {
  byVariantPrep: ReadonlyMap<string, BatchInventoryEntry>;
}

export interface SubstitutionEdge {
  id: number;
  fromIngredientId: number | null;
  fromVariantId: number | null;
  toIngredientId: number | null;
  toVariantId: number | null;
  ratio: number;
  contextTags: readonly string[];
  scope: SubstitutionScope;
  recipeId: number | null;
}

/** Bulk-loaded edge index — global + per-recipe scoped. */
export interface SubstitutionsIndex {
  global: readonly SubstitutionEdge[];
  byRecipe: ReadonlyMap<number, readonly SubstitutionEdge[]>;
}

/** Inputs to the per-line resolver. */
export interface LineCtx {
  recipeId: number;
  ingredientId: number;
  variantId: number | null;
  recipeTags: readonly string[];
}

/** One candidate edge after override + context-tag filtering. */
export interface SubstitutionCandidate {
  edgeId: number;
  ratio: number;
  toIngredientId: number | null;
  toVariantId: number | null;
  scope: SubstitutionScope;
}

function inventoryKey(variantId: number, prepStateId: number | null): string {
  return prepStateId === null ? `${variantId}|*` : `${variantId}|${prepStateId}`;
}

export function buildInventoryKey(variantId: number, prepStateId: number | null): string {
  return inventoryKey(variantId, prepStateId);
}

export function loadBatchInventory(db: FoodDb): BatchInventory {
  const rows = db
    .select({
      variantId: batches.variantId,
      prepStateId: batches.prepStateId,
      qtyRemaining: batches.qtyRemaining,
      unit: batches.unit,
    })
    .from(batches)
    .where(and(sql`${batches.qtyRemaining} > 0`, isNull(batches.deletedAt)))
    .all();
  const map = new Map<string, BatchInventoryEntry>();
  for (const row of rows) {
    const key = inventoryKey(row.variantId, row.prepStateId);
    const existing = map.get(key);
    if (existing === undefined) {
      map.set(key, { totalQty: row.qtyRemaining, unit: row.unit });
    } else {
      existing.totalQty += row.qtyRemaining;
    }
  }
  return { byVariantPrep: map };
}

function parseContextTags(raw: string): readonly string[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  const out: string[] = [];
  for (const value of parsed) {
    if (typeof value === 'string') out.push(value);
  }
  return out;
}

function rowToEdge(row: {
  id: number;
  fromIngredientId: number | null;
  fromVariantId: number | null;
  toIngredientId: number | null;
  toVariantId: number | null;
  ratio: number;
  contextTags: string;
  scope: SubstitutionScope;
  recipeId: number | null;
}): SubstitutionEdge {
  return {
    id: row.id,
    fromIngredientId: row.fromIngredientId,
    fromVariantId: row.fromVariantId,
    toIngredientId: row.toIngredientId,
    toVariantId: row.toVariantId,
    ratio: row.ratio,
    contextTags: parseContextTags(row.contextTags),
    scope: row.scope,
    recipeId: row.recipeId,
  };
}

export function loadSubstitutionsIndex(
  db: FoodDb,
  recipeIds?: readonly number[]
): SubstitutionsIndex {
  const rows = db
    .select({
      id: substitutions.id,
      fromIngredientId: substitutions.fromIngredientId,
      fromVariantId: substitutions.fromVariantId,
      toIngredientId: substitutions.toIngredientId,
      toVariantId: substitutions.toVariantId,
      ratio: substitutions.ratio,
      contextTags: substitutions.contextTags,
      scope: substitutions.scope,
      recipeId: substitutions.recipeId,
    })
    .from(substitutions)
    .all();
  const recipeFilter = recipeIds === undefined ? null : new Set<number>(recipeIds);
  const global: SubstitutionEdge[] = [];
  const byRecipe = new Map<number, SubstitutionEdge[]>();
  for (const row of rows) {
    const edge = rowToEdge(row);
    if (edge.scope === 'global') {
      global.push(edge);
      continue;
    }
    if (edge.recipeId === null) continue;
    if (recipeFilter !== null && !recipeFilter.has(edge.recipeId)) continue;
    const bucket = byRecipe.get(edge.recipeId);
    if (bucket === undefined) {
      byRecipe.set(edge.recipeId, [edge]);
    } else {
      bucket.push(edge);
    }
  }
  return { global, byRecipe };
}

function edgeMatchesFromSide(edge: SubstitutionEdge, ctx: LineCtx): boolean {
  if (edge.fromVariantId !== null) {
    return ctx.variantId !== null && edge.fromVariantId === ctx.variantId;
  }
  if (edge.fromIngredientId !== null) {
    return edge.fromIngredientId === ctx.ingredientId;
  }
  return false;
}

function contextTagsMatch(edgeTags: readonly string[], recipeTags: readonly string[]): boolean {
  if (edgeTags.length === 0) return true;
  if (recipeTags.length === 0) return false;
  const set = new Set(recipeTags);
  for (const tag of edgeTags) {
    if (set.has(tag)) return true;
  }
  return false;
}

function toPairKey(edge: SubstitutionEdge): string {
  const from =
    edge.fromVariantId !== null ? `v${edge.fromVariantId}` : `i${edge.fromIngredientId ?? 0}`;
  const to = edge.toVariantId !== null ? `v${edge.toVariantId}` : `i${edge.toIngredientId ?? 0}`;
  return `${from}->${to}`;
}

function toCandidate(edge: SubstitutionEdge): SubstitutionCandidate {
  return {
    edgeId: edge.id,
    ratio: edge.ratio,
    toIngredientId: edge.toIngredientId,
    toVariantId: edge.toVariantId,
    scope: edge.scope,
  };
}

/**
 * Apply PRD-109's `(from, to)`-pair override semantics + context-tag
 * filter to a line's candidate set. Recipe-scoped edges supersede the
 * global edge with the same pair key; other global edges from the
 * same `from` survive unchanged.
 */
export function resolveCandidatesForLine(
  index: SubstitutionsIndex,
  ctx: LineCtx
): SubstitutionCandidate[] {
  const recipeBucket = index.byRecipe.get(ctx.recipeId) ?? [];
  const recipeMatches: SubstitutionEdge[] = [];
  const overriddenPairs = new Set<string>();
  for (const edge of recipeBucket) {
    if (!edgeMatchesFromSide(edge, ctx)) continue;
    if (!contextTagsMatch(edge.contextTags, ctx.recipeTags)) continue;
    recipeMatches.push(edge);
    overriddenPairs.add(toPairKey(edge));
  }
  const globalMatches: SubstitutionEdge[] = [];
  for (const edge of index.global) {
    if (!edgeMatchesFromSide(edge, ctx)) continue;
    if (overriddenPairs.has(toPairKey(edge))) continue;
    if (!contextTagsMatch(edge.contextTags, ctx.recipeTags)) continue;
    globalMatches.push(edge);
  }
  return [...recipeMatches, ...globalMatches].map(toCandidate);
}
