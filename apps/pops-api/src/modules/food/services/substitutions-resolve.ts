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
 *   - `loadSubstitutionsIndex(db, recipeIds?)` — one-shot bulk load
 *     scoped via SQL to global edges + recipe-scoped edges for the
 *     given recipe IDs (omit = every edge in the table).
 *   - `resolveCandidatesForLine(index, ctx)` — pure function that
 *     filters the prebuilt index for one line context.
 *   - `loadBatchInventory(db)` — bulk pantry snapshot keyed by
 *     `(variantId, prepStateId|null)`.
 *
 * SQL + type plumbing lives in sibling files (`-loaders.ts`,
 * `-types.ts`) so each file stays under the per-file lint cap.
 */
export {
  buildInventoryKey,
  loadBatchInventory,
  loadSubstitutionsIndex,
  parseContextTags,
} from './substitutions-resolve-loaders.js';
export type {
  BatchInventory,
  BatchInventoryEntry,
  LineCtx,
  SubstitutionCandidate,
  SubstitutionEdge,
  SubstitutionScope,
  SubstitutionsIndex,
} from './substitutions-resolve-types.js';

import type {
  LineCtx,
  SubstitutionCandidate,
  SubstitutionEdge,
  SubstitutionsIndex,
} from './substitutions-resolve-types.js';

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
    contextTags: edge.contextTags,
    recipeId: edge.recipeId,
    notes: edge.notes,
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
