/**
 * PRD-138 — `food.inbox.listFailed` query.
 *
 * Returns `ingest_sources` rows whose latest meta represents a worker
 * failure. The single predicate `error_code IS NOT NULL` covers PRD-138's
 * "no successful retry" rule because PRD-125's `workerComplete` clears
 * `error_code` / `error_message` on the next successful attempt.
 *
 * Auth-dead Instagram reels (PRD-130) do NOT appear here — they ship as
 * `ok: true` partial drafts with `partialReason='auth-dead'`, so
 * `error_code` stays NULL and they live in the Drafts tab instead.
 */
import { and, desc, eq, gte, inArray, isNotNull, lt, or, type SQL } from 'drizzle-orm';

import { ingestSources } from '@pops/db-types';

import { decodeCursor, encodeCursor, sinceCutoffIso } from './list-shared.js';

import type { FoodDb } from '@pops/app-food-db';

import type { FailedRow, IngestKind } from './list-schemas.js';

export interface FailedListInput {
  errorCodes?: string[];
  kinds?: IngestKind[];
  sinceDays: 7 | 30 | 90 | null;
  cursor?: string;
  limit: number;
}

function buildConditions(input: FailedListInput): SQL[] {
  const conditions: SQL[] = [isNotNull(ingestSources.errorCode)];
  if (input.errorCodes !== undefined && input.errorCodes.length > 0) {
    conditions.push(inArray(ingestSources.errorCode, input.errorCodes));
  }
  if (input.kinds !== undefined && input.kinds.length > 0) {
    conditions.push(inArray(ingestSources.kind, input.kinds));
  }
  const cutoff = sinceCutoffIso(input.sinceDays);
  if (cutoff !== null) conditions.push(gte(ingestSources.ingestedAt, cutoff));

  const decoded = decodeCursor(input.cursor);
  if (decoded !== null) {
    conditions.push(
      or(
        lt(ingestSources.ingestedAt, decoded.ts),
        and(eq(ingestSources.ingestedAt, decoded.ts), lt(ingestSources.id, decoded.id))
      ) as SQL
    );
  }
  return conditions;
}

export async function listFailed(
  db: FoodDb,
  input: FailedListInput
): Promise<{ items: FailedRow[]; nextCursor?: string }> {
  const rows = await db
    .select({
      sourceId: ingestSources.id,
      ingestKind: ingestSources.kind,
      sourceUrl: ingestSources.url,
      errorCode: ingestSources.errorCode,
      errorMessage: ingestSources.errorMessage,
      ingestedAt: ingestSources.ingestedAt,
      attempts: ingestSources.attempts,
    })
    .from(ingestSources)
    .where(and(...buildConditions(input)))
    .orderBy(desc(ingestSources.ingestedAt), desc(ingestSources.id))
    .limit(input.limit + 1)
    .all();

  const hasMore = rows.length > input.limit;
  const sliced = hasMore ? rows.slice(0, input.limit) : rows;
  const items: FailedRow[] = sliced.map((r) => ({
    sourceId: r.sourceId,
    ingestKind: r.ingestKind,
    sourceUrl: r.sourceUrl,
    // `error_code` / `error_message` are filtered non-null at the SQL
    // layer (`isNotNull(errorCode)`); the column type stays nullable so
    // the ?? satisfies TS without an `as` cast.
    errorCode: r.errorCode ?? '',
    errorMessage: r.errorMessage ?? '',
    ingestedAt: r.ingestedAt,
    attempts: r.attempts,
  }));
  const last = sliced[sliced.length - 1];
  if (!hasMore || last === undefined) return { items };
  return { items, nextCursor: encodeCursor(last.ingestedAt, last.sourceId) };
}
