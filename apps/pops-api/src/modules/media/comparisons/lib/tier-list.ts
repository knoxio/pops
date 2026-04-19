import { and, eq } from 'drizzle-orm';

import { comparisons, mediaScores } from '@pops/db-types';

import { getDb, getDrizzle } from '../../../../db.js';
import { ValidationError } from '../../../../shared/errors.js';
import { getDimension } from '../dimensions.service.js';
import { convertTierPlacements } from '../tier-conversion.js';
import { setTierOverride } from '../tier-overrides.js';
import { findExistingComparison, normalizePairOrder } from './comparison-queries.js';
import { recalcDimensionElo, updateEloScores } from './score-management.js';

import type {
  BatchComparisonItem,
  BatchRecordResult,
  RecordComparisonInput,
  ScoreChange,
  SubmitTierListInput,
  SubmitTierListResult,
  TierListMovie,
} from '../types.js';

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

function getMoviePosterUrl(override: string | null, tmdbId: number | null): string | null {
  if (override) return override;
  if (tmdbId) return `/media/images/movie/${tmdbId}/poster.jpg`;
  return null;
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
    // Always generate the URL when tmdbId is available — the images endpoint
    // handles the case where poster_path is null by fetching from TMDB on demand.
    posterUrl: getMoviePosterUrl(row.moviePosterOverride, row.movieTmdbId),
    score: Math.round(row.score * 10) / 10,
    comparisonCount: row.comparisonCount,
  };
}

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
