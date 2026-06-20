/**
 * PRD-134 — `food.inbox.list` + `food.inbox.pendingCount` server queries.
 *
 * Drives the Drafts tab in `/food/inbox` and the sidebar pending-count badge.
 * Both queries share the same predicate base — ingest-originated drafts whose
 * source has not yet been reviewed and whose parent recipe is not archived.
 *
 * The PRD chose in-memory band sorting + filtering because the heuristic
 * score is not a column — it's derived per-row from PRD-137's `scoreDraft`.
 * SQL narrows by `kind` (PRD-138's `idx_ingest_sources_kind` helps);
 * everything else (`bands`, `partialReasons`, `freshOnly`, score sort) runs
 * in memory after a single batched gather. Single-user load + PRD §Edge
 * Cases ("hundreds of drafts max") makes the O(N) pass cheap.
 *
 * Score, filter, sort and paginate live in `inbox-queries-drafts-helpers`
 * and the shapes live in `inbox-queries-drafts-types` — the split keeps
 * each module under the per-file lint cap.
 */
import { and, count, eq, inArray, isNull, type SQL } from 'drizzle-orm';

import { gatherQualityInputsForVersions } from '../../inbox/gather-quality-inputs.js';
import { ingestSources, recipes, recipeVersions } from '../schema.js';
import { type JoinedDraftRow, paginate, scoreAndFilter } from './inbox-queries-drafts-helpers.js';

import type { IngestSourceKind } from '../schema.js';
import type { InboxDraftRow, ListDraftsFilter } from './inbox-queries-drafts-types.js';
import type { ListPage } from './inbox-queries-shared.js';
import type { FoodDb } from './internal.js';

export {
  decodeDraftsCursor,
  encodeDraftsCursor,
  type DraftSort,
  type DraftsCursor,
  type InboxDraftRow,
  type ListDraftsFilter,
} from './inbox-queries-drafts-types.js';

/**
 * Returns rows for the Drafts tab. Computes the band per row using
 * `scoreDraft` over the input batched from `gatherQualityInputsForVersions`
 * — single SQL round-trip for inputs, no N+1 (the gather helper batches).
 */
export function listDrafts(
  db: FoodDb,
  filter: ListDraftsFilter,
  now?: Date
): ListPage<InboxDraftRow> {
  const joined = selectPendingDraftRows(db, filter.kinds);
  if (joined.length === 0) return { items: [], nextCursor: null };

  const inputs = gatherQualityInputsForVersions(
    db,
    joined.map((r) => r.versionId),
    now ?? new Date()
  );
  const scored = scoreAndFilter(joined, inputs, filter);
  return paginate(scored, filter);
}

/**
 * Sidebar badge value. Counts ingest-originated drafts whose source has not
 * been reviewed and whose parent recipe is not archived. No band / kind /
 * fresh filter — the badge is the unfiltered queue depth, by design.
 */
export function countPendingDrafts(db: FoodDb): number {
  const rows = db
    .select({ n: count() })
    .from(recipeVersions)
    .innerJoin(ingestSources, eq(ingestSources.id, recipeVersions.sourceId))
    .innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
    .where(pendingDraftsPredicate(undefined))
    .all();
  return rows[0]?.n ?? 0;
}

function selectPendingDraftRows(
  db: FoodDb,
  kinds: IngestSourceKind[] | undefined
): JoinedDraftRow[] {
  return db
    .select({
      versionId: recipeVersions.id,
      recipeSlug: recipes.slug,
      sourceId: ingestSources.id,
      title: recipeVersions.title,
      recipeType: recipes.recipeType,
      ingestKind: ingestSources.kind,
      sourceUrl: ingestSources.url,
      ingestedAt: ingestSources.ingestedAt,
      compileStatus: recipeVersions.compileStatus,
    })
    .from(recipeVersions)
    .innerJoin(ingestSources, eq(ingestSources.id, recipeVersions.sourceId))
    .innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
    .where(pendingDraftsPredicate(kinds))
    .all();
}

function pendingDraftsPredicate(kinds: IngestSourceKind[] | undefined): SQL | undefined {
  const clauses: SQL[] = [
    eq(recipeVersions.status, 'draft'),
    isNull(ingestSources.reviewedAt),
    isNull(recipes.archivedAt),
  ];
  if (kinds && kinds.length > 0) clauses.push(inArray(ingestSources.kind, kinds));
  return and(...clauses);
}
