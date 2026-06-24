/**
 * `food.inbox.listRejected` server-side query.
 *
 * Drives the Rejected tab in `/food/inbox`. Joins four tables to produce
 * `RejectedRow[]` in one SQL pass:
 *
 *   recipe_versions      (the archived draft)
 *   recipe_version_rejections (the metadata that distinguishes inbox-reject
 *                              from manual discard — presence-of-row)
 *   ingest_sources       (provenance — INNER JOIN because rejected drafts
 *                         are by construction ingest-originated; the inbox
 *                         can't reject manually-authored drafts)
 *   recipes              (slug for inspector navigation)
 *
 * `ingestCostUsd` is always `null` — AI telemetry lives in the ai pillar, so
 * per-source ingest cost is not tracked in the food DB.
 *
 * Pagination cursor: `(rejected_at DESC, version_id DESC)` — the rejected_at
 * default expression is `datetime('now')` which is unique per insert under
 * normal load but the version_id tiebreaker keeps the order stable when
 * two rejections land in the same second.
 */
import { and, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';

import { ingestSources, recipes, recipeVersionRejections, recipeVersions } from '../schema.js';
import {
  encodeCursor,
  type ListPage,
  type ListRejectedFilter,
  type RejectedRow,
  type RejectionReason,
  sinceDaysAgoIso,
} from './inbox-queries-shared.js';
import { type FoodDb } from './internal.js';

export function listRejectedVersions(
  db: FoodDb,
  filter: ListRejectedFilter
): ListPage<RejectedRow> {
  const rows = selectRejectedRows(db, filter);
  const trimmed = rows.slice(0, filter.limit);
  const items = trimmed.map(
    (r): RejectedRow => ({
      versionId: r.versionId,
      recipeSlug: r.recipeSlug,
      sourceId: r.sourceId,
      title: r.title,
      reason: r.reason as RejectionReason,
      note: r.note,
      rejectedAt: r.rejectedAt,
      ingestKind: r.ingestKind,
      sourceUrl: r.sourceUrl,
      ingestCostUsd: r.ingestCostUsd,
    })
  );
  const last = trimmed[trimmed.length - 1];
  const nextCursor =
    rows.length > filter.limit && last !== undefined
      ? encodeCursor(last.rejectedAt, last.versionId)
      : null;
  return { items, nextCursor };
}

interface JoinedRejectedRow {
  versionId: number;
  recipeSlug: string;
  sourceId: number;
  title: string | null;
  reason: string;
  note: string | null;
  rejectedAt: string;
  ingestKind: RejectedRow['ingestKind'];
  sourceUrl: string | null;
  ingestCostUsd: number | null;
}

function selectRejectedRows(db: FoodDb, filter: ListRejectedFilter): JoinedRejectedRow[] {
  return db
    .select({
      versionId: recipeVersions.id,
      recipeSlug: recipes.slug,
      sourceId: ingestSources.id,
      title: recipeVersions.title,
      reason: recipeVersionRejections.reason,
      note: recipeVersionRejections.note,
      rejectedAt: recipeVersionRejections.rejectedAt,
      ingestKind: ingestSources.kind,
      sourceUrl: ingestSources.url,
      ingestCostUsd: sql<number | null>`NULL`,
    })
    .from(recipeVersionRejections)
    .innerJoin(recipeVersions, eq(recipeVersions.id, recipeVersionRejections.versionId))
    .innerJoin(ingestSources, eq(ingestSources.id, recipeVersions.sourceId))
    .innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
    .where(buildWhere(filter))
    .orderBy(desc(recipeVersionRejections.rejectedAt), desc(recipeVersions.id))
    .limit(filter.limit + 1)
    .all();
}

function buildWhere(filter: ListRejectedFilter): SQL | undefined {
  const clauses: SQL[] = [];
  if (filter.reasons && filter.reasons.length > 0) {
    clauses.push(inArray(recipeVersionRejections.reason, filter.reasons));
  }
  if (filter.kinds && filter.kinds.length > 0) {
    clauses.push(inArray(ingestSources.kind, filter.kinds));
  }
  const sinceIso = sinceDaysAgoIso(filter.sinceDays);
  if (sinceIso !== null) {
    clauses.push(sql`${recipeVersionRejections.rejectedAt} >= ${sinceIso}`);
  }
  if (filter.cursor) {
    const cursorClause = or(
      lt(recipeVersionRejections.rejectedAt, filter.cursor.sortKey),
      and(
        eq(recipeVersionRejections.rejectedAt, filter.cursor.sortKey),
        lt(recipeVersions.id, filter.cursor.id)
      )
    );
    if (cursorClause !== undefined) clauses.push(cursorClause);
  }
  return clauses.length === 0 ? undefined : and(...clauses);
}
