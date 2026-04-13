/**
 * Comparisons service — dimensions, 1v1 comparisons, and Elo scores.
 */
import {
  comparisonDimensions,
  comparisons,
  comparisonSkipCooloffs,
  debriefResults,
  debriefSessions,
  debriefStatus,
  mediaScores,
  movies,
  watchHistory,
} from '@pops/db-types';
import { and, asc, count, desc, eq, or } from 'drizzle-orm';

import { getDb, getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors.js';
import { getDimension } from './dimensions.service.js';
import { getGlobalComparisonCount } from './global-count.js';
import { findExistingComparison, normalizePairOrder } from './lib/comparison-queries.js';
import { recalcDimensionElo, updateEloScores } from './lib/score-management.js';
import { convertTierPlacements } from './tier-conversion.js';
import { setTierOverride } from './tier-overrides.js';
import {
  type BatchComparisonItem,
  type BatchRecordResult,
  type BlacklistMovieResult,
  type ComparisonRow,
  type DebriefOpponent,
  type PendingDebrief,
  type RecordComparisonInput,
  type RecordDebriefComparisonInput,
  type ScoreChange,
  type SubmitTierListInput,
  type SubmitTierListResult,
  type TierListMovie,
} from './types.js';
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
export { drawTierOutcome, ELO_K, expectedScore } from './lib/elo-calculator.js';
export {
  recalcAllDimensions,
  recalcDimensionElo,
  updateEloScores,
} from './lib/score-management.js';
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

// ── Dimension Exclusion ──

/**
 * Exclude a media item from a dimension: sets excluded=1 on the media_scores row
 * (creates with score 1500 + excluded=1 if missing), deletes all comparisons
 * involving that item for this dimension, and recalculates ELO.
 */
export function excludeFromDimension(
  mediaType: string,
  mediaId: number,
  dimensionId: number
): { comparisonsDeleted: number } {
  getDimension(dimensionId); // verify exists
  const drizzleDb = getDrizzle();
  const rawDb = getDb();

  let comparisonsDeleted = 0;

  rawDb.transaction(() => {
    // Upsert media_scores row with excluded=1
    const existing = drizzleDb
      .select()
      .from(mediaScores)
      .where(
        and(
          eq(mediaScores.mediaType, mediaType),
          eq(mediaScores.mediaId, mediaId),
          eq(mediaScores.dimensionId, dimensionId)
        )
      )
      .get();

    if (existing) {
      drizzleDb
        .update(mediaScores)
        .set({ excluded: 1, updatedAt: new Date().toISOString() })
        .where(eq(mediaScores.id, existing.id))
        .run();
    } else {
      drizzleDb
        .insert(mediaScores)
        .values({
          mediaType,
          mediaId,
          dimensionId,
          score: 1500.0,
          comparisonCount: 0,
          excluded: 1,
        })
        .run();
    }

    // Delete all comparisons involving this media item for this dimension
    const result = drizzleDb
      .delete(comparisons)
      .where(
        and(
          eq(comparisons.dimensionId, dimensionId),
          or(
            and(eq(comparisons.mediaAType, mediaType), eq(comparisons.mediaAId, mediaId)),
            and(eq(comparisons.mediaBType, mediaType), eq(comparisons.mediaBId, mediaId))
          )
        )
      )
      .run();

    comparisonsDeleted = result.changes;

    // Recalculate ELO for this dimension
    recalcDimensionElo(dimensionId);
  })();

  return { comparisonsDeleted };
}

/**
 * Re-include a media item in a dimension: sets excluded=0.
 */
export function includeInDimension(mediaType: string, mediaId: number, dimensionId: number): void {
  getDimension(dimensionId); // verify exists
  const drizzleDb = getDrizzle();

  const existing = drizzleDb
    .select()
    .from(mediaScores)
    .where(
      and(
        eq(mediaScores.mediaType, mediaType),
        eq(mediaScores.mediaId, mediaId),
        eq(mediaScores.dimensionId, dimensionId)
      )
    )
    .get();

  if (!existing) {
    throw new NotFoundError('MediaScore', `${mediaType}:${mediaId}:${dimensionId}`);
  }

  drizzleDb
    .update(mediaScores)
    .set({ excluded: 0, updatedAt: new Date().toISOString() })
    .where(eq(mediaScores.id, existing.id))
    .run();
}

// ── Skip Cooloff ──

/**
 * Record a skip cooloff for a pair of media items in a dimension.
 * Sets skip_until = current global comparison count + 10.
 * Upserts if the pair already has a cooloff (extends it).
 */
export function recordSkip(
  dimensionId: number,
  mediaAType: string,
  mediaAId: number,
  mediaBType: string,
  mediaBId: number
): number {
  const db = getDrizzle();
  const globalCount = getGlobalComparisonCount();
  const skipUntil = globalCount + 10;

  // Normalize pair ordering for consistent storage (lower id first)
  const [normAType, normAId, normBType, normBId] = normalizePairOrder(
    mediaAType,
    mediaAId,
    mediaBType,
    mediaBId
  );

  // Upsert: insert or update skip_until if pair already exists
  const existing = db
    .select()
    .from(comparisonSkipCooloffs)
    .where(
      and(
        eq(comparisonSkipCooloffs.dimensionId, dimensionId),
        eq(comparisonSkipCooloffs.mediaAType, normAType),
        eq(comparisonSkipCooloffs.mediaAId, normAId),
        eq(comparisonSkipCooloffs.mediaBType, normBType),
        eq(comparisonSkipCooloffs.mediaBId, normBId)
      )
    )
    .get();

  if (existing) {
    db.update(comparisonSkipCooloffs)
      .set({ skipUntil })
      .where(eq(comparisonSkipCooloffs.id, existing.id))
      .run();
  } else {
    db.insert(comparisonSkipCooloffs)
      .values({
        dimensionId,
        mediaAType: normAType,
        mediaAId: normAId,
        mediaBType: normBType,
        mediaBId: normBId,
        skipUntil,
      })
      .run();
  }

  return skipUntil;
}

/**
 * Check if a pair is currently on cooloff for a dimension.
 * Returns true if global comparison count < skip_until.
 * Symmetric: A-vs-B matches B-vs-A.
 */
export function isPairOnCooloff(
  dimensionId: number,
  mediaAType: string,
  mediaAId: number,
  mediaBType: string,
  mediaBId: number
): boolean {
  const db = getDrizzle();
  const globalCount = getGlobalComparisonCount();

  // Normalize pair ordering for consistent lookup
  const [normAType, normAId, normBType, normBId] = normalizePairOrder(
    mediaAType,
    mediaAId,
    mediaBType,
    mediaBId
  );

  const cooloff = db
    .select()
    .from(comparisonSkipCooloffs)
    .where(
      and(
        eq(comparisonSkipCooloffs.dimensionId, dimensionId),
        eq(comparisonSkipCooloffs.mediaAType, normAType),
        eq(comparisonSkipCooloffs.mediaAId, normAId),
        eq(comparisonSkipCooloffs.mediaBType, normBType),
        eq(comparisonSkipCooloffs.mediaBId, normBId)
      )
    )
    .get();

  if (!cooloff) return false;
  return globalCount < cooloff.skipUntil;
}

// ── Debrief Opponent Selection ──

/**
 * Select a debrief opponent — the eligible movie closest to the median score
 * for the given dimension.
 *
 * Excludes:
 *  - The debrief movie itself
 *  - Movies excluded from the dimension (excluded = 1)
 *  - Blacklisted movies (watch_history.blacklisted = 1)
 *  - Movies already compared against the debrief movie in this dimension
 */
export function getDebriefOpponent(
  mediaType: string,
  mediaId: number,
  dimensionId: number
): DebriefOpponent | null {
  getDimension(dimensionId); // verify dimension exists

  const db = getDrizzle();

  // Get all non-excluded scores for this dimension
  const allScores = db
    .select()
    .from(mediaScores)
    .where(
      and(
        eq(mediaScores.dimensionId, dimensionId),
        eq(mediaScores.mediaType, mediaType),
        eq(mediaScores.excluded, 0)
      )
    )
    .orderBy(asc(mediaScores.score))
    .all();

  // Get blacklisted movie IDs
  const blacklistedIds = new Set(
    db
      .select({ mediaId: watchHistory.mediaId })
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.mediaType, mediaType as 'movie' | 'episode'),
          eq(watchHistory.blacklisted, 1)
        )
      )
      .all()
      .map((r) => r.mediaId)
  );

  // Get IDs of movies already compared against this one in this dimension
  const comparedAgainstIds = new Set<number>();
  const compsA = db
    .select({ mediaBId: comparisons.mediaBId })
    .from(comparisons)
    .where(
      and(
        eq(comparisons.dimensionId, dimensionId),
        eq(comparisons.mediaAType, mediaType),
        eq(comparisons.mediaAId, mediaId)
      )
    )
    .all();
  for (const c of compsA) comparedAgainstIds.add(c.mediaBId);

  const compsB = db
    .select({ mediaAId: comparisons.mediaAId })
    .from(comparisons)
    .where(
      and(
        eq(comparisons.dimensionId, dimensionId),
        eq(comparisons.mediaBType, mediaType),
        eq(comparisons.mediaBId, mediaId)
      )
    )
    .all();
  for (const c of compsB) comparedAgainstIds.add(c.mediaAId);

  // Filter eligible candidates
  const eligible = allScores.filter(
    (s) =>
      s.mediaId !== mediaId && !blacklistedIds.has(s.mediaId) && !comparedAgainstIds.has(s.mediaId)
  );

  if (eligible.length === 0) return null;

  // Find median score
  const medianIndex = Math.floor(eligible.length / 2);
  const medianEntry = eligible[medianIndex];
  if (!medianEntry) return null;
  const medianScore = medianEntry.score;

  // Pick the one closest to median
  let closest = eligible[0];
  if (!closest) return null;
  let closestDist = Math.abs(closest.score - medianScore);
  for (const s of eligible) {
    const dist = Math.abs(s.score - medianScore);
    if (dist < closestDist) {
      closest = s;
      closestDist = dist;
    }
  }

  // Fetch movie metadata
  const movieRow = db
    .select({
      id: movies.id,
      title: movies.title,
      posterPath: movies.posterPath,
      tmdbId: movies.tmdbId,
      posterOverridePath: movies.posterOverridePath,
    })
    .from(movies)
    .where(eq(movies.id, closest.mediaId))
    .get();

  if (!movieRow) return null;

  const posterUrl = movieRow.posterOverridePath
    ? movieRow.posterOverridePath
    : movieRow.posterPath
      ? `/media/images/movie/${movieRow.tmdbId}/poster.jpg`
      : null;

  return {
    id: movieRow.id,
    title: movieRow.title,
    posterPath: movieRow.posterPath,
    posterUrl,
  };
}

// ── Pending Debriefs ──

/**
 * Get all movies with pending or active debrief sessions.
 * Joins debrief_sessions → watch_history → movies and counts
 * how many dimensions still need results per session.
 */
export function getPendingDebriefs(): PendingDebrief[] {
  const db = getDrizzle();

  // Get sessions that are pending or active
  const sessions = db
    .select({
      sessionId: debriefSessions.id,
      status: debriefSessions.status,
      watchHistoryId: debriefSessions.watchHistoryId,
      createdAt: debriefSessions.createdAt,
    })
    .from(debriefSessions)
    .where(or(eq(debriefSessions.status, 'pending'), eq(debriefSessions.status, 'active')))
    .orderBy(desc(debriefSessions.createdAt))
    .all();

  if (sessions.length === 0) return [];

  // Get count of active dimensions
  const activeDimCount =
    db
      .select({ total: count() })
      .from(comparisonDimensions)
      .where(eq(comparisonDimensions.active, 1))
      .all()[0]?.total ?? 0;

  const results: PendingDebrief[] = [];

  for (const session of sessions) {
    // Get watch history entry to find media info
    const whEntry = db
      .select({
        mediaType: watchHistory.mediaType,
        mediaId: watchHistory.mediaId,
      })
      .from(watchHistory)
      .where(eq(watchHistory.id, session.watchHistoryId))
      .get();

    if (!whEntry || whEntry.mediaType !== 'movie') continue;

    // Get movie info
    const movieRow = db
      .select({
        id: movies.id,
        title: movies.title,
        posterPath: movies.posterPath,
        tmdbId: movies.tmdbId,
        posterOverridePath: movies.posterOverridePath,
      })
      .from(movies)
      .where(eq(movies.id, whEntry.mediaId))
      .get();

    if (!movieRow) continue;

    // Count completed debrief results for this session
    const completedCount =
      db
        .select({ total: count() })
        .from(debriefResults)
        .where(eq(debriefResults.sessionId, session.sessionId))
        .all()[0]?.total ?? 0;

    const pendingDimensionCount = Math.max(0, activeDimCount - completedCount);

    const posterUrl = movieRow.posterOverridePath
      ? movieRow.posterOverridePath
      : movieRow.posterPath
        ? `/media/images/movie/${movieRow.tmdbId}/poster.jpg`
        : null;

    results.push({
      sessionId: session.sessionId,
      movieId: movieRow.id,
      title: movieRow.title,
      posterUrl,
      status: session.status as 'pending' | 'active',
      createdAt: session.createdAt,
      pendingDimensionCount,
    });
  }

  return results;
}

// ── Tier List Movie Selection ──

const MAX_TIER_LIST_MOVIES = 8;
const STALENESS_THRESHOLD = 0.3;

/**
 * Select up to 8 movies for a tier list placement round.
 *
 * Strategy — greedy maximum coverage:
 *  1. Fetch all eligible movies and all existing comparison pairs
 *  2. Greedily pick movies that maximize NEW pairwise comparisons
 *  3. Tie-break by lowest comparison count (highest uncertainty)
 *  - Exclude: blacklisted, excluded-for-dimension, staleness < 0.3
 *  - Returns fewer than 8 if not enough eligible (min 0)
 */
export function getTierListMovies(dimensionId: number): TierListMovie[] {
  getDimension(dimensionId); // verify dimension exists

  const rawDb = getDb();

  // Get eligible movies: non-excluded, with scores, joined to movie metadata
  const rows = rawDb
    .prepare(
      `SELECT
        ms.media_id as mediaId,
        ms.score as score,
        ms.comparison_count as comparisonCount,
        m.title as title,
        m.poster_path as moviePosterPath,
        m.tmdb_id as movieTmdbId,
        m.poster_override_path as moviePosterOverride
      FROM media_scores ms
      JOIN movies m ON ms.media_id = m.id
      LEFT JOIN watch_history wh ON wh.media_type = 'movie' AND wh.media_id = ms.media_id AND wh.blacklisted = 1
      LEFT JOIN comparison_staleness cs ON cs.media_type = 'movie' AND cs.media_id = ms.media_id
      WHERE ms.dimension_id = ?
        AND ms.media_type = 'movie'
        AND ms.excluded = 0
        AND wh.id IS NULL
        AND COALESCE(cs.staleness, 1.0) >= ?
      ORDER BY ms.comparison_count ASC, ms.score DESC`
    )
    .all(dimensionId, STALENESS_THRESHOLD) as Array<{
    mediaId: number;
    score: number;
    comparisonCount: number;
    title: string;
    moviePosterPath: string | null;
    movieTmdbId: number | null;
    moviePosterOverride: string | null;
  }>;

  if (rows.length === 0) return [];

  // If we have 8 or fewer, return them all
  if (rows.length <= MAX_TIER_LIST_MOVIES) {
    return rows.map(toTierListMovie);
  }

  // Build set of existing comparison pair keys for this dimension
  const existingPairs = new Set<string>();
  const pairRows = rawDb
    .prepare(
      `SELECT media_a_type, media_a_id, media_b_type, media_b_id
       FROM comparisons
       WHERE dimension_id = ?`
    )
    .all(dimensionId) as Array<{
    media_a_type: string;
    media_a_id: number;
    media_b_type: string;
    media_b_id: number;
  }>;
  for (const p of pairRows) {
    const [nAt, nAi, nBt, nBi] = normalizePairOrder(
      p.media_a_type,
      p.media_a_id,
      p.media_b_type,
      p.media_b_id
    );
    existingPairs.add(`${nAt}:${nAi}:${nBt}:${nBi}`);
  }

  // Greedy selection: pick movies that maximize new pairwise comparisons
  const selected: typeof rows = [];
  const selectedIds = new Set<number>();

  for (let round = 0; round < MAX_TIER_LIST_MOVIES && rows.length > 0; round++) {
    let bestIdx = -1;
    let bestNewPairs = -1;
    let bestCompCount = Infinity;

    for (let i = 0; i < rows.length; i++) {
      const candidate = rows[i];
      if (!candidate || selectedIds.has(candidate.mediaId)) continue;

      // Count new pairs this candidate would create with already-selected movies
      let newPairs = 0;
      for (const sel of selected) {
        const [nAt, nAi, nBt, nBi] = normalizePairOrder(
          'movie',
          candidate.mediaId,
          'movie',
          sel.mediaId
        );
        const key = `${nAt}:${nAi}:${nBt}:${nBi}`;
        if (!existingPairs.has(key)) {
          newPairs++;
        }
      }

      // Tie-break: more new pairs wins, then lower comparison count
      if (
        newPairs > bestNewPairs ||
        (newPairs === bestNewPairs && candidate.comparisonCount < bestCompCount)
      ) {
        bestIdx = i;
        bestNewPairs = newPairs;
        bestCompCount = candidate.comparisonCount;
      }
    }

    if (bestIdx === -1) break;
    const pick = rows[bestIdx];
    if (!pick) break;
    selected.push(pick);
    selectedIds.add(pick.mediaId);
  }

  return selected.map(toTierListMovie);
}

function toTierListMovie(row: {
  mediaId: number;
  title: string;
  moviePosterOverride: string | null;
  moviePosterPath: string | null;
  movieTmdbId: number | null;
  score: number;
  comparisonCount: number;
}): TierListMovie {
  return {
    id: row.mediaId,
    title: row.title,
    posterUrl: row.moviePosterOverride
      ? row.moviePosterOverride
      : row.moviePosterPath && row.movieTmdbId
        ? `/media/images/movie/${row.movieTmdbId}/poster.jpg`
        : null,
    score: Math.round(row.score * 10) / 10,
    comparisonCount: row.comparisonCount,
  };
}

// ── Debrief Dismiss ──

/**
 * Dismiss a debrief dimension — inserts a debrief_result with comparison_id=null
 * (marks the dimension as skipped). Auto-completes the session when all active
 * dimensions have results.
 */
export function dismissDebriefDimension(sessionId: number, dimensionId: number): void {
  const db = getDrizzle();

  // Verify session exists and is not complete
  const session = db.select().from(debriefSessions).where(eq(debriefSessions.id, sessionId)).get();

  if (!session) {
    throw new NotFoundError('Debrief session', String(sessionId));
  }
  if (session.status === 'complete') {
    throw new ValidationError(`Debrief session ${sessionId} is already complete`);
  }

  // Verify dimension exists
  getDimension(dimensionId);

  // Check for duplicate dismiss
  const existing = db
    .select()
    .from(debriefResults)
    .where(
      and(eq(debriefResults.sessionId, sessionId), eq(debriefResults.dimensionId, dimensionId))
    )
    .get();

  if (existing) {
    throw new ConflictError(
      `Dimension ${dimensionId} already has a result for session ${sessionId}`
    );
  }

  // Insert debrief_result with null comparison_id (dismissed)
  db.insert(debriefResults).values({ sessionId, dimensionId, comparisonId: null }).run();

  // Mark debrief_status row as dismissed
  const watchEntry = db
    .select()
    .from(watchHistory)
    .where(eq(watchHistory.id, session.watchHistoryId))
    .get();
  if (watchEntry) {
    db.update(debriefStatus)
      .set({ dismissed: 1 })
      .where(
        and(
          eq(debriefStatus.mediaType, watchEntry.mediaType),
          eq(debriefStatus.mediaId, watchEntry.mediaId),
          eq(debriefStatus.dimensionId, dimensionId)
        )
      )
      .run();
  }

  // Check if all active dimensions now have results → auto-complete
  const activeDims = db
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .all();

  const resultCount = db
    .select({ cnt: count() })
    .from(debriefResults)
    .where(eq(debriefResults.sessionId, sessionId))
    .get();

  if (resultCount && resultCount.cnt >= activeDims.length) {
    db.update(debriefSessions)
      .set({ status: 'complete' })
      .where(eq(debriefSessions.id, sessionId))
      .run();
  }
}

// ── Batch Record Comparisons ──

/**
 * Record multiple comparisons in a single transaction with ELO updates.
 *
 * All-or-nothing: if any comparison fails, the entire batch is rolled back.
 * Each comparison is inserted and its ELO scores are updated within the
 * same transaction. Returns the total count of comparisons recorded.
 */
export function batchRecordComparisons(
  dimensionId: number,
  items: BatchComparisonItem[],
  source?: string | null
): BatchRecordResult {
  const rawDb = getDb();
  const drizzleDb = getDrizzle();

  // Validate dimension exists and is active
  const dimension = getDimension(dimensionId);
  if (dimension.active !== 1) {
    throw new ValidationError('Cannot record comparisons for inactive dimension');
  }

  let insertedCount = 0;
  let skippedCount = 0;
  let hasOverrides = false;

  rawDb.transaction(() => {
    for (const item of items) {
      // Check for existing comparison on this pair+dimension
      const existing = findExistingComparison(
        dimensionId,
        item.mediaAType,
        item.mediaAId,
        item.mediaBType,
        item.mediaBId
      );

      if (existing) {
        const existingSource = existing.source ?? null;
        const incomingSource = source ?? null;
        if (sourceRank(incomingSource) >= sourceRank(existingSource)) {
          // Override: delete old row immediately to prevent stale lookups
          drizzleDb.delete(comparisons).where(eq(comparisons.id, existing.id)).run();
          hasOverrides = true;
        } else {
          // Skip: existing has higher authority
          skippedCount++;
          continue;
        }
      }

      // Insert without incremental ELO if any overrides — recalc will rebuild
      if (hasOverrides) {
        drizzleDb
          .insert(comparisons)
          .values({
            dimensionId,
            mediaAType: item.mediaAType,
            mediaAId: item.mediaAId,
            mediaBType: item.mediaBType,
            mediaBId: item.mediaBId,
            winnerType: item.winnerType,
            winnerId: item.winnerId,
            drawTier: item.drawTier ?? null,
            source: source ?? null,
          })
          .run();
      } else {
        const comparisonInput: RecordComparisonInput = {
          dimensionId,
          mediaAType: item.mediaAType,
          mediaAId: item.mediaAId,
          mediaBType: item.mediaBType,
          mediaBId: item.mediaBId,
          winnerType: item.winnerType,
          winnerId: item.winnerId,
          drawTier: item.drawTier ?? null,
        };

        // No overrides yet — compute Elo deltas incrementally
        const { deltaA, deltaB } = updateEloScores(comparisonInput);

        drizzleDb
          .insert(comparisons)
          .values({
            dimensionId,
            mediaAType: item.mediaAType,
            mediaAId: item.mediaAId,
            mediaBType: item.mediaBType,
            mediaBId: item.mediaBId,
            winnerType: item.winnerType,
            winnerId: item.winnerId,
            drawTier: item.drawTier ?? null,
            source: source ?? null,
            deltaA,
            deltaB,
          })
          .run();
      }

      insertedCount++;
    }

    // Full recalc inside the transaction for atomicity
    if (hasOverrides) {
      recalcDimensionElo(dimensionId);
    }
  })();

  return { count: insertedCount, skipped: skippedCount };
}

// ── Tier List Submission ──

/**
 * Submit a tier list: converts tier placements into pairwise comparisons.
 *
 * For each pair of placed movies, the higher-tier movie wins.
 * Movies in the same tier are recorded as a "mid" draw.
 * Also sets tier overrides for each placement.
 *
 * Returns the number of comparisons recorded and score deltas.
 */
export function submitTierList(input: SubmitTierListInput): SubmitTierListResult {
  const rawDb = getDb();
  const drizzleDb = getDrizzle();

  // Capture old scores for all placed movies
  const oldScores = new Map<number, number>();
  for (const placement of input.placements) {
    const existing = drizzleDb
      .select()
      .from(mediaScores)
      .where(
        and(
          eq(mediaScores.mediaType, 'movie'),
          eq(mediaScores.mediaId, placement.movieId),
          eq(mediaScores.dimensionId, input.dimensionId)
        )
      )
      .get();
    oldScores.set(placement.movieId, existing?.score ?? 1500.0);
  }

  // Convert placements to pairwise comparisons, then to batch items
  const pairwise = convertTierPlacements(input.placements);
  const batchItems: BatchComparisonItem[] = pairwise.map((pair) => ({
    mediaAType: 'movie' as const,
    mediaAId: pair.mediaAId,
    mediaBType: 'movie' as const,
    mediaBId: pair.mediaBId,
    winnerType: 'movie' as const,
    winnerId: pair.winnerId,
    drawTier: pair.drawTier,
  }));

  // Batch-record comparisons (validates dimension + inserts + ELO updates)
  const { count: comparisonsRecorded, skipped } = batchRecordComparisons(
    input.dimensionId,
    batchItems,
    'tier_list'
  );

  // Set tier overrides for each placement
  rawDb.transaction(() => {
    for (const placement of input.placements) {
      setTierOverride('movie', placement.movieId, input.dimensionId, placement.tier);
    }
  })();

  // Collect score changes
  const scoreChanges: ScoreChange[] = [];
  for (const placement of input.placements) {
    const newRow = drizzleDb
      .select()
      .from(mediaScores)
      .where(
        and(
          eq(mediaScores.mediaType, 'movie'),
          eq(mediaScores.mediaId, placement.movieId),
          eq(mediaScores.dimensionId, input.dimensionId)
        )
      )
      .get();

    scoreChanges.push({
      movieId: placement.movieId,
      oldScore: oldScores.get(placement.movieId) ?? 1500.0,
      newScore: newRow?.score ?? 1500.0,
    });
  }

  return { comparisonsRecorded, skipped, scoreChanges };
}

// ── Debrief Comparison ──

/**
 * Record a debrief comparison for a session + dimension.
 * If winnerId > 0, records a real comparison via recordComparison and links it.
 * If winnerId = 0, creates a debrief_result with null comparison_id (skip).
 * Auto-completes the session when all active dimensions have results.
 */
export function recordDebriefComparison(input: RecordDebriefComparisonInput): {
  comparisonId: number | null;
  sessionComplete: boolean;
} {
  const drizzleDb = getDrizzle();
  const rawDb = getDb();

  // Validate session exists and is not complete
  const session = drizzleDb
    .select()
    .from(debriefSessions)
    .where(eq(debriefSessions.id, input.sessionId))
    .get();
  if (!session) throw new NotFoundError('Debrief session', String(input.sessionId));
  if (session.status === 'complete') {
    throw new ValidationError('Debrief session is already complete');
  }

  // Get the debrief movie from watch_history
  const watchEntry = drizzleDb
    .select()
    .from(watchHistory)
    .where(eq(watchHistory.id, session.watchHistoryId))
    .get();
  if (!watchEntry) throw new NotFoundError('Watch history entry', String(session.watchHistoryId));

  // Check dimension hasn't already been recorded for this session
  const existingResult = drizzleDb
    .select()
    .from(debriefResults)
    .where(
      and(
        eq(debriefResults.sessionId, input.sessionId),
        eq(debriefResults.dimensionId, input.dimensionId)
      )
    )
    .get();
  if (existingResult) {
    throw new ConflictError('Dimension already recorded for this session');
  }

  return rawDb.transaction(() => {
    let comparisonId: number | null = null;

    if (input.winnerId > 0) {
      // Record a real comparison
      const compRow = recordComparison({
        dimensionId: input.dimensionId,
        mediaAType: watchEntry.mediaType as 'movie' | 'tv_show',
        mediaAId: watchEntry.mediaId,
        mediaBType: input.opponentType,
        mediaBId: input.opponentId,
        winnerType:
          input.winnerId === watchEntry.mediaId
            ? (watchEntry.mediaType as 'movie' | 'tv_show')
            : input.opponentType,
        winnerId: input.winnerId,
        drawTier: input.drawTier ?? null,
        source: 'arena',
      });
      comparisonId = compRow.id;
    }

    // Create debrief_result
    drizzleDb
      .insert(debriefResults)
      .values({
        sessionId: input.sessionId,
        dimensionId: input.dimensionId,
        comparisonId,
      })
      .run();

    // Mark debrief_status row as debriefed
    drizzleDb
      .update(debriefStatus)
      .set({ debriefed: 1 })
      .where(
        and(
          eq(debriefStatus.mediaType, watchEntry.mediaType),
          eq(debriefStatus.mediaId, watchEntry.mediaId),
          eq(debriefStatus.dimensionId, input.dimensionId)
        )
      )
      .run();

    // Activate session if still pending
    if (session.status === 'pending') {
      drizzleDb
        .update(debriefSessions)
        .set({ status: 'active' })
        .where(eq(debriefSessions.id, input.sessionId))
        .run();
    }

    // Check if session is complete (all active dimensions have results)
    const activeDimCount = drizzleDb
      .select({ cnt: count() })
      .from(comparisonDimensions)
      .where(eq(comparisonDimensions.active, 1))
      .get();

    const resultCount = drizzleDb
      .select({ cnt: count() })
      .from(debriefResults)
      .where(eq(debriefResults.sessionId, input.sessionId))
      .get();

    const sessionComplete =
      activeDimCount !== undefined &&
      resultCount !== undefined &&
      resultCount.cnt >= activeDimCount.cnt;

    if (sessionComplete) {
      drizzleDb
        .update(debriefSessions)
        .set({ status: 'complete' })
        .where(eq(debriefSessions.id, input.sessionId))
        .run();
    }

    return { comparisonId, sessionComplete };
  })();
}
