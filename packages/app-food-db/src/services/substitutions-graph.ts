/**
 * Graph-view read helper for PRD-148 substitution graph explorer.
 *
 * The graph page wants the full filtered subgraph in one round-trip: every
 * edge that matches the user's filters, plus enough about each touched
 * ingredient / variant / recipe to render the node labels and side panels
 * without a follow-up query. Public surface is `loadGraphView`; SQL +
 * shape helpers live in sibling files (`./substitutions-graph-types.ts`
 * for the wire shapes, `./substitutions-graph-internal.ts` for the SQL +
 * lookup-map logic) so each file stays under the per-file lint cap.
 *
 * Filter set mirrors the page header controls:
 *   - `scope` (default 'global')
 *   - `recipeId` (required iff scope='recipe', enforced at the tRPC boundary)
 *   - `contextTag` — wildcard-OR semantics matching PRD-109 + the existing
 *     `listSubstitutions` helper (empty `context_tags` array is a wildcard)
 *   - `search` — applied in TypeScript against hydrated slugs/names to keep
 *     SQL simple (the join-by-id post-fetch is already a small set at this
 *     scale, <500 edges per PRD-148's stated upper bound)
 *
 * Performance note (from PRD-148 spec): the partial index
 * `idx_subs_scope_recipe` covers only `scope='recipe'`. Global-view queries
 * therefore full-scan the `substitutions` table. Acceptable at <500 edges;
 * revisit if scale grows.
 */
import { type FoodDb } from './internal.js';
import {
  fetchEdgeRows,
  fetchLookups,
  makeSide,
  parseContextTags,
} from './substitutions-graph-internal.js';

import type {
  GraphViewEdgeRow,
  GraphViewFilter,
  GraphViewResult,
  GraphViewSide,
} from './substitutions-graph-types.js';

export type {
  GraphViewEdgeRow,
  GraphViewFilter,
  GraphViewResult,
  GraphViewSide,
} from './substitutions-graph-types.js';

function sideMatchesSearch(side: GraphViewSide, needle: string): boolean {
  if (side.ingredientSlug.toLowerCase().includes(needle)) return true;
  if (side.ingredientName.toLowerCase().includes(needle)) return true;
  if (side.variantSlug !== null && side.variantSlug.toLowerCase().includes(needle)) return true;
  if (side.variantName !== null && side.variantName.toLowerCase().includes(needle)) return true;
  return false;
}

export function loadGraphView(db: FoodDb, filter: GraphViewFilter = {}): GraphViewResult {
  const rows = fetchEdgeRows(db, filter);
  const { ingByIs, varById, recipeById } = fetchLookups(db, rows);

  const hydrated: GraphViewEdgeRow[] = rows.map((row) => {
    const fromSide = makeSide(row.fromIngredientId, row.fromVariantId, ingByIs, varById);
    const toSide = makeSide(row.toIngredientId, row.toVariantId, ingByIs, varById);
    const recipe = row.recipeId !== null ? recipeById.get(row.recipeId) : undefined;
    return {
      id: row.id,
      fromSide,
      toSide,
      ratio: row.ratio,
      contextTags: parseContextTags(row.contextTags),
      scope: row.scope,
      recipeId: row.recipeId,
      recipeSlug: recipe?.slug ?? null,
      notes: row.notes,
    };
  });

  const needle = filter.search?.trim().toLowerCase() ?? '';
  if (needle.length === 0) return { edges: hydrated };
  const matching = hydrated.filter(
    (edge) => sideMatchesSearch(edge.fromSide, needle) || sideMatchesSearch(edge.toSide, needle)
  );
  return { edges: matching };
}
