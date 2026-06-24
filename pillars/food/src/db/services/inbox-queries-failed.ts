/**
 * `food.inbox.listFailed` + `food.inbox.failedErrorCodes`.
 *
 * Drives the Failed-ingests tab in `/food/inbox`. The "no successful retry"
 * rule reduces to `WHERE error_code IS NOT NULL AND error_message IS NOT NULL`
 * — the worker writes the pair on `ok:false` and clears it on the next
 * success. Guarding on both columns defends against a half-finished backfill or a
 * legacy row leaving one half null, which would otherwise surface as an
 * empty `errorMessage` in the UI.
 *
 * Auth-dead Instagram reels never reach this tab: the worker emits
 * `ok: true, partialReason: 'auth-dead'`, writes a placeholder draft, and
 * never sets `error_code`. The Drafts tab + the `PARTIAL_AUTH_DEAD` quality
 * signal handle that surface.
 *
 * Pagination cursor: `(ingested_at DESC, id DESC)`.
 */
import { and, desc, eq, inArray, isNotNull, lt, or, sql, type SQL } from 'drizzle-orm';

import { ingestSources } from '../schema.js';
import {
  encodeCursor,
  type FailedRow,
  type ListFailedFilter,
  type ListPage,
  sinceDaysAgoIso,
} from './inbox-queries-shared.js';
import { type FoodDb } from './internal.js';

export function listFailedSources(db: FoodDb, filter: ListFailedFilter): ListPage<FailedRow> {
  const rows = selectFailedRows(db, filter);
  const trimmed = rows.slice(0, filter.limit);
  const items = trimmed.map(
    (r): FailedRow => ({
      sourceId: r.sourceId,
      ingestKind: r.ingestKind,
      sourceUrl: r.sourceUrl,
      errorCode: r.errorCode,
      // `buildWhere` enforces `error_message IS NOT NULL` so the column type
      // is structurally nullable but the value never is. The empty-string
      // fallback stays as defence in depth in case the predicate ever
      // moves.
      errorMessage: r.errorMessage ?? '',
      ingestedAt: r.ingestedAt,
      attempts: r.attempts,
    })
  );
  const last = trimmed[trimmed.length - 1];
  const nextCursor =
    rows.length > filter.limit && last !== undefined
      ? encodeCursor(last.ingestedAt, last.sourceId)
      : null;
  return { items, nextCursor };
}

interface JoinedFailedRow {
  sourceId: number;
  ingestKind: FailedRow['ingestKind'];
  sourceUrl: string | null;
  errorCode: string;
  errorMessage: string | null;
  ingestedAt: string;
  attempts: number;
}

function selectFailedRows(db: FoodDb, filter: ListFailedFilter): JoinedFailedRow[] {
  return db
    .select({
      sourceId: ingestSources.id,
      ingestKind: ingestSources.kind,
      sourceUrl: ingestSources.url,
      errorCode: sql<string>`${ingestSources.errorCode}`,
      errorMessage: ingestSources.errorMessage,
      ingestedAt: ingestSources.ingestedAt,
      attempts: ingestSources.attempts,
    })
    .from(ingestSources)
    .where(buildWhere(filter))
    .orderBy(desc(ingestSources.ingestedAt), desc(ingestSources.id))
    .limit(filter.limit + 1)
    .all();
}

function buildWhere(filter: ListFailedFilter): SQL | undefined {
  // The worker writes `error_code` and `error_message` as a pair on
  // `ok:false` and clears them as a pair on a successful retry. Pinning both
  // predicates keeps the Failed tab from surfacing legacy or backfilled rows
  // where only one half is populated (which would render as an empty error
  // message in the UI).
  const clauses: SQL[] = [
    isNotNull(ingestSources.errorCode),
    isNotNull(ingestSources.errorMessage),
  ];
  if (filter.errorCodes && filter.errorCodes.length > 0) {
    clauses.push(inArray(ingestSources.errorCode, filter.errorCodes));
  }
  if (filter.kinds && filter.kinds.length > 0) {
    clauses.push(inArray(ingestSources.kind, filter.kinds));
  }
  const sinceIso = sinceDaysAgoIso(filter.sinceDays);
  if (sinceIso !== null) {
    clauses.push(sql`${ingestSources.ingestedAt} >= ${sinceIso}`);
  }
  if (filter.cursor) {
    const cursorClause = or(
      lt(ingestSources.ingestedAt, filter.cursor.sortKey),
      and(
        eq(ingestSources.ingestedAt, filter.cursor.sortKey),
        lt(ingestSources.id, filter.cursor.id)
      )
    );
    if (cursorClause !== undefined) clauses.push(cursorClause);
  }
  return and(...clauses);
}

/**
 * `SELECT DISTINCT error_code FROM ingest_sources WHERE error_code IS NOT NULL`.
 * Drives the Error-code filter chip — the chip auto-populates so newly
 * emitted codes from future handlers surface without a UI change.
 */
export function listFailedErrorCodes(db: FoodDb): string[] {
  const rows = db
    .selectDistinct({ errorCode: ingestSources.errorCode })
    .from(ingestSources)
    .where(isNotNull(ingestSources.errorCode))
    .orderBy(ingestSources.errorCode)
    .all();
  return rows.map((r) => r.errorCode).filter((c): c is string => c !== null);
}
