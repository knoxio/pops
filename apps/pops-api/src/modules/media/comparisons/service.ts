/**
 * Comparisons service — dimensions, 1v1 comparisons, and Elo scores.
 *
 * Core orchestrators live here; extracted modules in lib/ handle specific domains.
 */
import { comparisons } from '@pops/db-types';
import { and, eq, or } from 'drizzle-orm';

import { getDb, getDrizzle } from '../../../db.js';
import { NotFoundError, ValidationError } from '../../../shared/errors.js';
import { getDimension } from './dimensions.service.js';
import { findExistingComparison } from './lib/comparison-queries.js';
import { recordDebriefComparison as recordDebriefComparisonImpl } from './lib/debrief.js';
import { recalcDimensionElo, updateEloScores } from './lib/score-management.js';
import type {
  BlacklistMovieResult,
  ComparisonRow,
  RecordComparisonInput,
  RecordDebriefComparisonInput,
} from './types.js';

// ── Re-exports from extracted modules ──

export {
  createDimension,
  listDimensions,
  seedDefaultDimensions,
  updateDimension,
} from './dimensions.service.js';
export { getGlobalComparisonCount } from './global-count.js';
export {
  type ComparisonListResult,
  listAllComparisons,
  listComparisonsForMedia,
} from './lib/comparison-queries.js';
export { dismissDebriefDimension, getDebriefOpponent, getPendingDebriefs } from './lib/debrief.js';
export { excludeFromDimension, includeInDimension } from './lib/dimension-exclusion.js';
export { drawTierOutcome, ELO_K, expectedScore } from './lib/elo-calculator.js';
export {
  recalcAllDimensions,
  recalcDimensionElo,
  updateEloScores,
} from './lib/score-management.js';
export { isPairOnCooloff, recordSkip } from './lib/skip-cooloff.js';
export { batchRecordComparisons, getTierListMovies, submitTierList } from './lib/tier-list.js';
export { getRandomPair } from './pairs/random-pair.js';
export { getSmartPair } from './pairs/smart-pair.js';
export { getRankings, type RankingsResult, resolvePosterUrl } from './rankings.service.js';
export { getScoresForMedia } from './scores.service.js';

// ── Source Hierarchy ──

/** Source authority ranking: higher rank = more authoritative. null/historical = 0. */
function sourceRank(source: string | null | undefined): number {
  switch (source) {
    case 'arena':
      return 2;
    case 'tier_list':
      return 1;
    default:
      return 0;
  }
}

// ── Comparisons ──

/**
 * Record a 1v1 comparison and update Elo scores.
 * Validates that the winner matches one of the two media items.
 * Wraps insert + Elo update in a transaction for consistency.
 */
export function recordComparison(input: RecordComparisonInput): ComparisonRow {
  const drizzleDb = getDrizzle();

  // Verify dimension exists and is active
  const dimension = getDimension(input.dimensionId);
  if (dimension.active !== 1) {
    throw new ValidationError('Cannot record comparison for inactive dimension');
  }

  // Validate winner matches one of the two media items, or is a draw (winnerId = 0)
  const isDraw = input.winnerId === 0;
  const winnerIsA =
    !isDraw && input.winnerType === input.mediaAType && input.winnerId === input.mediaAId;
  const winnerIsB =
    !isDraw && input.winnerType === input.mediaBType && input.winnerId === input.mediaBId;

  if (!isDraw && !winnerIsA && !winnerIsB) {
    throw new ValidationError('Winner must match either media A or media B, or be 0 for a draw');
  }

  const newSource = input.source ?? 'arena';

  // Wrap insert + Elo update in a transaction
  const rawDb = getDb();
  const row = rawDb.transaction(() => {
    // Check for existing comparison on this pair+dimension
    const existing = findExistingComparison(
      input.dimensionId,
      input.mediaAType,
      input.mediaAId,
      input.mediaBType,
      input.mediaBId
    );

    if (existing) {
      const existingSource = existing.source ?? null;
      if (sourceRank(newSource) >= sourceRank(existingSource)) {
        // Override: delete old row, insert new, then full recalc
        drizzleDb.delete(comparisons).where(eq(comparisons.id, existing.id)).run();

        // Insert without incremental ELO — recalc will rebuild everything
        const result = drizzleDb
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

        // Full recalc replays all comparisons and sets correct deltas
        recalcDimensionElo(input.dimensionId);

        const inserted = drizzleDb
          .select()
          .from(comparisons)
          .where(eq(comparisons.id, Number(result.lastInsertRowid)))
          .get();
        if (!inserted) throw new Error('Failed to retrieve recorded comparison');
        return inserted;
      } else {
        // Skip: existing has higher authority
        return existing;
      }
    }

    // No existing — compute Elo deltas incrementally and store on the comparison
    const { deltaA, deltaB } = updateEloScores(input);

    const result = drizzleDb
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

    const inserted = drizzleDb
      .select()
      .from(comparisons)
      .where(eq(comparisons.id, Number(result.lastInsertRowid)))
      .get();
    if (!inserted) throw new Error('Failed to retrieve recorded comparison');
    return inserted;
  })();

  return row;
}

/**
 * Delete a comparison and recalculate Elo scores for the affected dimension.
 * Replays all remaining comparisons in chronological order to ensure accuracy.
 */
export function deleteComparison(id: number): void {
  const drizzleDb = getDrizzle();
  const rawDb = getDb();

  const comparison = drizzleDb.select().from(comparisons).where(eq(comparisons.id, id)).get();
  if (!comparison) throw new NotFoundError('Comparison', String(id));

  const dimensionId = comparison.dimensionId;

  rawDb.transaction(() => {
    // Delete the comparison
    drizzleDb.delete(comparisons).where(eq(comparisons.id, id)).run();

    // Recalculate ELO for the affected dimension
    recalcDimensionElo(dimensionId);
  })();
}

/**
 * Blacklist a movie: mark all its watch_history rows as blacklisted,
 * delete all comparisons involving it, and recalculate ELO for affected dimensions.
 */
export function blacklistMovie(mediaType: string, mediaId: number): BlacklistMovieResult {
  const drizzleDb = getDrizzle();
  const rawDb = getDb();

  return rawDb.transaction(() => {
    // 1. Set blacklisted = 1 on all watch_history rows for this media
    const blacklistResult = rawDb
      .prepare(
        `UPDATE watch_history SET blacklisted = 1
         WHERE media_type = ? AND media_id = ? AND blacklisted = 0`
      )
      .run(mediaType, mediaId);
    const blacklistedCount = blacklistResult.changes;

    // 2. Find all comparisons involving this media (either side)
    const affectedComparisons = drizzleDb
      .select()
      .from(comparisons)
      .where(
        or(
          and(eq(comparisons.mediaAType, mediaType), eq(comparisons.mediaAId, mediaId)),
          and(eq(comparisons.mediaBType, mediaType), eq(comparisons.mediaBId, mediaId))
        )
      )
      .all();

    const comparisonsDeleted = affectedComparisons.length;

    // 3. Collect affected dimension IDs (unique)
    const affectedDimensionIds = [...new Set(affectedComparisons.map((c) => c.dimensionId))];

    // 4. Delete all comparisons involving this media
    if (comparisonsDeleted > 0) {
      rawDb
        .prepare(
          `DELETE FROM comparisons
           WHERE (media_a_type = ? AND media_a_id = ?)
              OR (media_b_type = ? AND media_b_id = ?)`
        )
        .run(mediaType, mediaId, mediaType, mediaId);
    }

    // 5. Replay ELO for each affected dimension (resets scores + updates stored deltas)
    for (const dimensionId of affectedDimensionIds) {
      recalcDimensionElo(dimensionId);
    }

    return {
      blacklistedCount,
      comparisonsDeleted,
      dimensionsRecalculated: affectedDimensionIds.length,
    };
  })();
}

/**
 * Record a debrief comparison — delegates to lib/debrief.ts with recordComparison
 * passed as a callback to avoid circular dependencies.
 */
export function recordDebriefComparison(input: RecordDebriefComparisonInput): {
  comparisonId: number | null;
  sessionComplete: boolean;
} {
  return recordDebriefComparisonImpl(input, recordComparison);
}
