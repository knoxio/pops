/**
 * PRD-138 — `food.inbox.listRejected` query.
 *
 * Joins archived-and-rejected versions with their `ingest_sources`, the
 * parent recipe (for the slug), and a correlated subquery against
 * `ai_inference_log` for the per-source cost rollup. PRD-119's manual
 * discard path lands on `status='archived'` too but writes no rejections
 * row — the INNER JOIN against `recipe_version_rejections` filters those
 * out implicitly.
 */
import { and, desc, eq, gte, inArray, isNotNull, lt, or, sql, type SQL } from 'drizzle-orm';

import {
  aiInferenceLog,
  ingestSources,
  recipes,
  recipeVersionRejections,
  recipeVersions,
} from '@pops/db-types';

import { decodeCursor, encodeCursor, sinceCutoffIso } from './list-shared.js';

import type { FoodDb } from '@pops/app-food-db';

import type { IngestKind, RejectedRow, RejectionReason } from './list-schemas.js';

export interface RejectedListInput {
  reasons?: RejectionReason[];
  kinds?: IngestKind[];
  sinceDays: 7 | 30 | 90 | null;
  cursor?: string;
  limit: number;
}

/** Aggregated ingest-cost as a correlated subquery — avoids a JOIN+GROUP BY
 *  that would couple this query to PRD-133's row shape, and scales fine at
 *  the inbox's page size. PRD-133 uses the string-namespaced
 *  `ingest_source:<id>` context_id rather than a numeric FK. */
const INGEST_COST_SUBQUERY = sql<number | null>`(
  SELECT COALESCE(SUM(${aiInferenceLog.costUsd}), 0)
  FROM ${aiInferenceLog}
  WHERE ${aiInferenceLog.contextId} = 'ingest_source:' || ${ingestSources.id}
)`;

function buildConditions(input: RejectedListInput): SQL[] {
  const conditions: SQL[] = [
    // PRD-136's `NotIngestOriginated` rule. The INNER JOIN on `ingest_sources`
    // would already filter this, but the explicit predicate is cheaper to
    // reason about than reading the JOIN graph.
    isNotNull(recipeVersions.sourceId),
  ];
  if (input.reasons !== undefined && input.reasons.length > 0) {
    conditions.push(inArray(recipeVersionRejections.reason, input.reasons));
  }
  if (input.kinds !== undefined && input.kinds.length > 0) {
    conditions.push(inArray(ingestSources.kind, input.kinds));
  }
  const cutoff = sinceCutoffIso(input.sinceDays);
  if (cutoff !== null) conditions.push(gte(recipeVersionRejections.rejectedAt, cutoff));

  const decoded = decodeCursor(input.cursor);
  if (decoded !== null) {
    // (rejectedAt, versionId) DESC tiebreak — mirrors the ORDER BY.
    conditions.push(
      or(
        lt(recipeVersionRejections.rejectedAt, decoded.ts),
        and(
          eq(recipeVersionRejections.rejectedAt, decoded.ts),
          lt(recipeVersionRejections.versionId, decoded.id)
        )
      ) as SQL
    );
  }
  return conditions;
}

interface QueryRow {
  versionId: number;
  recipeSlug: string;
  sourceId: number;
  title: string | null;
  reason: string;
  note: string | null;
  rejectedAt: string;
  ingestKind: IngestKind;
  sourceUrl: string | null;
  ingestCostUsd: number | null;
}

function rowToView(r: QueryRow): RejectedRow {
  let title: string | null = r.title;
  if (title !== null && title.length === 0) title = null;
  // `COALESCE(SUM(...), 0)` returns 0 when no logs reference this source;
  // normalise that to `null` so the UI distinguishes "no cost data" from
  // a genuinely-$0 cost (degenerate — same UI treatment is acceptable).
  const ingestCostUsd = r.ingestCostUsd === 0 || r.ingestCostUsd === null ? null : r.ingestCostUsd;
  return {
    versionId: r.versionId,
    recipeSlug: r.recipeSlug,
    sourceId: r.sourceId,
    title,
    reason: r.reason as RejectionReason,
    note: r.note,
    rejectedAt: r.rejectedAt,
    ingestKind: r.ingestKind,
    sourceUrl: r.sourceUrl,
    ingestCostUsd,
  };
}

export async function listRejected(
  db: FoodDb,
  input: RejectedListInput
): Promise<{ items: RejectedRow[]; nextCursor?: string }> {
  const rows = await db
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
      ingestCostUsd: INGEST_COST_SUBQUERY,
    })
    .from(recipeVersions)
    .innerJoin(recipeVersionRejections, eq(recipeVersionRejections.versionId, recipeVersions.id))
    .innerJoin(ingestSources, eq(ingestSources.id, recipeVersions.sourceId))
    .innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
    .where(and(...buildConditions(input)))
    .orderBy(desc(recipeVersionRejections.rejectedAt), desc(recipeVersionRejections.versionId))
    .limit(input.limit + 1)
    .all();

  const hasMore = rows.length > input.limit;
  const sliced = hasMore ? rows.slice(0, input.limit) : rows;
  const items = sliced.map(rowToView);
  const last = sliced[sliced.length - 1];
  if (!hasMore || last === undefined) return { items };
  return { items, nextCursor: encodeCursor(last.rejectedAt, last.versionId) };
}
