/**
 * Core comparison mutations — record (with ELO), delete (with replay), and
 * blacklist (purge + replay). HTTP-free, `(db, …)` arg.
 */
import { and, eq, or, sql } from 'drizzle-orm';

import { comparisons, watchHistory } from '../../schema.js';
import { sourceRank } from './batch-record.js';
import { findExistingComparison } from './comparison-queries.js';
import { getDimension } from './dimensions.js';
import { ComparisonNotFoundError, InactiveDimensionError, InvalidWinnerError } from './errors.js';
import { recalcDimensionElo, updateEloScores } from './score-management.js';

import type { ComparisonRow } from '../../row-types.js';
import type { MediaDb } from '../internal.js';
import type { BlacklistMovieResult, RecordComparisonInput } from './mappers.js';

function validateRecordInput(db: MediaDb, input: RecordComparisonInput): void {
  const dimension = getDimension(db, input.dimensionId);
  if (dimension.active !== 1) {
    throw new InactiveDimensionError('Cannot record comparison for inactive dimension');
  }
  const isDraw = input.winnerId === 0;
  const winnerIsA =
    !isDraw && input.winnerType === input.mediaAType && input.winnerId === input.mediaAId;
  const winnerIsB =
    !isDraw && input.winnerType === input.mediaBType && input.winnerId === input.mediaBId;
  if (!isDraw && !winnerIsA && !winnerIsB) {
    throw new InvalidWinnerError('Winner must match either media A or media B, or be 0 for a draw');
  }
}

function fetchInserted(db: MediaDb, insertId: number): ComparisonRow {
  const inserted = db.select().from(comparisons).where(eq(comparisons.id, insertId)).get();
  if (!inserted) throw new Error('Failed to retrieve recorded comparison');
  return inserted;
}

function insertOverride(
  db: MediaDb,
  input: RecordComparisonInput,
  newSource: string
): ComparisonRow {
  const result = db
    .insert(comparisons)
    .values({
      dimensionId: input.dimensionId,
      mediaAType: input.mediaAType,
      mediaAId: input.mediaAId,
      mediaBType: input.mediaBType,
      mediaBId: input.mediaBId,
      winnerType: input.winnerType,
      winnerId: input.winnerId,
      drawTier: input.drawTier ?? null,
      source: newSource,
    })
    .run();
  recalcDimensionElo(db, input.dimensionId);
  return fetchInserted(db, Number(result.lastInsertRowid));
}

function insertIncremental(
  db: MediaDb,
  input: RecordComparisonInput,
  newSource: string
): ComparisonRow {
  const { deltaA, deltaB } = updateEloScores(db, input);
  const result = db
    .insert(comparisons)
    .values({
      dimensionId: input.dimensionId,
      mediaAType: input.mediaAType,
      mediaAId: input.mediaAId,
      mediaBType: input.mediaBType,
      mediaBId: input.mediaBId,
      winnerType: input.winnerType,
      winnerId: input.winnerId,
      drawTier: input.drawTier ?? null,
      source: newSource,
      deltaA,
      deltaB,
    })
    .run();
  return fetchInserted(db, Number(result.lastInsertRowid));
}

/**
 * Record a 1v1 comparison and update ELO. A more-authoritative source
 * replaces an existing pair (full replay); a less-authoritative one is a
 * no-op; an unseen pair takes the incremental update path.
 */
export function recordComparison(db: MediaDb, input: RecordComparisonInput): ComparisonRow {
  validateRecordInput(db, input);
  const newSource = input.source ?? 'arena';
  return db.transaction((tx) => {
    const existing = findExistingComparison(tx, input);
    if (existing) {
      if (sourceRank(newSource) < sourceRank(existing.source ?? null)) return existing;
      tx.delete(comparisons).where(eq(comparisons.id, existing.id)).run();
      return insertOverride(tx, input, newSource);
    }
    return insertIncremental(tx, input, newSource);
  });
}

/** Delete a comparison and replay-recalculate its dimension's ELO. */
export function deleteComparison(db: MediaDb, id: number): void {
  const comparison = db.select().from(comparisons).where(eq(comparisons.id, id)).get();
  if (!comparison) throw new ComparisonNotFoundError(id);
  const dimensionId = comparison.dimensionId;

  db.transaction((tx) => {
    tx.delete(comparisons).where(eq(comparisons.id, id)).run();
    recalcDimensionElo(tx, dimensionId);
  });
}

function findAffectedDimensionIds(db: MediaDb, mediaType: string, mediaId: number): number[] {
  const affected = db
    .select()
    .from(comparisons)
    .where(
      or(
        and(eq(comparisons.mediaAType, mediaType), eq(comparisons.mediaAId, mediaId)),
        and(eq(comparisons.mediaBType, mediaType), eq(comparisons.mediaBId, mediaId))
      )
    )
    .all();
  return [...new Set(affected.map((c) => c.dimensionId))];
}

/**
 * Blacklist a movie: mark its watch_history rows as blacklisted, delete every
 * comparison involving it, and replay-recalculate each affected dimension —
 * all in a single intra-pillar transaction.
 */
export function blacklistMovie(
  db: MediaDb,
  mediaType: string,
  mediaId: number
): BlacklistMovieResult {
  return db.transaction((tx) => {
    const blacklistResult = tx
      .update(watchHistory)
      .set({ blacklisted: 1 })
      .where(
        and(
          sql`${watchHistory.mediaType} = ${mediaType}`,
          eq(watchHistory.mediaId, mediaId),
          eq(watchHistory.blacklisted, 0)
        )
      )
      .run();

    const affectedDimensionIds = findAffectedDimensionIds(tx, mediaType, mediaId);
    const deleteResult = tx
      .delete(comparisons)
      .where(
        or(
          and(eq(comparisons.mediaAType, mediaType), eq(comparisons.mediaAId, mediaId)),
          and(eq(comparisons.mediaBType, mediaType), eq(comparisons.mediaBId, mediaId))
        )
      )
      .run();

    for (const dimensionId of affectedDimensionIds) recalcDimensionElo(tx, dimensionId);

    return {
      blacklistedCount: blacklistResult.changes,
      comparisonsDeleted: deleteResult.changes,
      dimensionsRecalculated: affectedDimensionIds.length,
    };
  });
}
