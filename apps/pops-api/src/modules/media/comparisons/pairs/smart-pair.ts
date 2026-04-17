import { eq } from 'drizzle-orm';

import { mediaWatchlist } from '@pops/db-types';

import { getDb, getDrizzle } from '../../../../db.js';
import { getDimension } from '../dimensions.service.js';
import { getGlobalComparisonCount } from '../global-count.js';
import { getStaleness } from '../staleness.js';
import { calculateConfidence } from '../types.js';

import type { RandomPair, SmartPairResult } from '../types.js';

/** Candidate movie with metadata needed for weighted scoring. */
interface CandidateMovie {
  id: number;
  title: string;
  posterPath: string | null;
  tmdbId: number;
  posterOverridePath: string | null;
  score: number;
  comparisonCount: number;
  daysSinceLastWatch: number;
  staleness: number;
}

/** Scored candidate pair. */
interface ScoredPair {
  movieA: CandidateMovie;
  movieB: CandidateMovie;
  priority: number;
}

/**
 * Pick a dimension by dimensionNeed = maxCompCount / (thisDimCompCount + 1).
 * Uses weighted random sampling proportional to dimensionNeed.
 */
function pickDimensionByNeed(rawDb: ReturnType<typeof getDb>): number | null {
  const dims = rawDb
    .prepare(
      `SELECT id, (SELECT COALESCE(SUM(comparison_count), 0) FROM media_scores WHERE dimension_id = cd.id) as compCount
       FROM comparison_dimensions cd
       WHERE cd.active = 1`
    )
    .all() as Array<{ id: number; compCount: number }>;

  if (dims.length === 0) return null;

  const maxCompCount = Math.max(...dims.map((d) => d.compCount), 1);
  const needs = dims.map((d) => ({
    id: d.id,
    need: maxCompCount / (d.compCount + 1),
  }));

  const totalNeed = needs.reduce((sum, d) => sum + d.need, 0);
  let r = Math.random() * totalNeed;
  for (const d of needs) {
    r -= d.need;
    if (r <= 0) return d.id;
  }
  return needs.at(-1)?.id ?? null;
}

/**
 * informationGain(A, B) = 1 / (1 + abs(scoreA - scoreB) / 200) × 1 / (pairCount + 1)
 */
function informationGain(scoreA: number, scoreB: number, pairCount: number): number {
  return (1 / (1 + Math.abs(scoreA - scoreB) / 200)) * (1 / (pairCount + 1));
}

/**
 * recencyWeight(movie) = 1 / (1 + daysSinceLastWatch / 180)
 */
function recencyWeight(daysSinceLastWatch: number): number {
  return 1 / (1 + daysSinceLastWatch / 180);
}

/**
 * Weighted random sample from items with weights.
 * Returns the selected item, or null if empty.
 */
function weightedRandomSample<T>(items: Array<{ item: T; weight: number }>): T | null {
  if (items.length === 0) return null;
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  if (total <= 0) {
    const picked = items[Math.floor(Math.random() * items.length)];
    return picked ? picked.item : null;
  }
  let r = Math.random() * total;
  for (const { item, weight } of items) {
    r -= weight;
    if (r <= 0) return item;
  }
  const last = items.at(-1);
  return last ? last.item : null;
}

const SAMPLE_SIZE = 50;

/** Build the RandomPair result from two CandidateMovie objects. */
function buildRandomPairResult(a: CandidateMovie, b: CandidateMovie): RandomPair {
  const resolveMoviePoster = (candidate: CandidateMovie): string | null => {
    if (candidate.posterOverridePath) return candidate.posterOverridePath;
    if (candidate.posterPath) return `/media/images/movie/${candidate.tmdbId}/poster.jpg`;
    return null;
  };

  return {
    movieA: {
      id: a.id,
      title: a.title,
      posterPath: a.posterPath,
      posterUrl: resolveMoviePoster(a),
    },
    movieB: {
      id: b.id,
      title: b.title,
      posterPath: b.posterPath,
      posterUrl: resolveMoviePoster(b),
    },
  };
}

/** Shuffle array and take first n elements (Fisher-Yates partial shuffle). */
function shuffleAndTake<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = 0; i < n && i < copy.length; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    const tmp = copy[i];
    copy[i] = copy[j] as T;
    copy[j] = tmp as T;
  }
  return copy.slice(0, n);
}

/**
 * Get a smart pair of watched movies for comparison using weighted probabilistic selection.
 *
 * Two-stage selection:
 * 1. Pick dimension by dimensionNeed (weighted random)
 * 2. Within dimension, sample eligible movies, generate candidate pairs, score, weighted random sample
 *
 * @param dimensionId - Optional specific dimension; if omitted, picks by dimensionNeed
 * @returns A pair of movies with metadata, or null if fewer than 2 eligible movies
 */
export function getSmartPair(dimensionId?: number): SmartPairResult | null {
  const rawDb = getDb();
  const db = getDrizzle();

  // Stage 1: pick dimension
  const selectedDimId = dimensionId ?? pickDimensionByNeed(rawDb);
  if (selectedDimId === null) return null;

  // Verify dimension exists
  getDimension(selectedDimId);

  // Get all completed, non-blacklisted watched movie IDs with their most recent watch date
  const watchedMovies = rawDb
    .prepare(
      `SELECT wh.media_id as mediaId,
              MAX(wh.watched_at) as lastWatchedAt
       FROM watch_history wh
       WHERE wh.media_type = 'movie'
         AND wh.completed = 1
         AND wh.blacklisted = 0
       GROUP BY wh.media_id`
    )
    .all() as Array<{ mediaId: number; lastWatchedAt: string }>;

  // Exclude movies on the watchlist
  const watchlistedIds = new Set(
    db
      .select({ mediaId: mediaWatchlist.mediaId })
      .from(mediaWatchlist)
      .where(eq(mediaWatchlist.mediaType, 'movie'))
      .all()
      .map((r) => r.mediaId)
  );

  // Exclude movies excluded for this dimension
  const excludedRows = rawDb
    .prepare(
      `SELECT media_id FROM media_scores
       WHERE dimension_id = ? AND media_type = 'movie' AND excluded = 1`
    )
    .all(selectedDimId) as Array<{ media_id: number }>;
  const excludedIds = new Set(excludedRows.map((r) => r.media_id));

  // Get pairs on cooloff for this dimension (skip_until is a global comparison count)
  const globalCount = getGlobalComparisonCount();
  const cooloffPairs = new Set<string>();
  const cooloffRows = rawDb
    .prepare(
      `SELECT media_a_id, media_b_id FROM comparison_skip_cooloffs
       WHERE dimension_id = ? AND media_a_type = 'movie' AND media_b_type = 'movie'
         AND skip_until > ?`
    )
    .all(selectedDimId, globalCount) as Array<{ media_a_id: number; media_b_id: number }>;

  for (const r of cooloffRows) {
    cooloffPairs.add(`${r.media_a_id}-${r.media_b_id}`);
    cooloffPairs.add(`${r.media_b_id}-${r.media_a_id}`);
  }

  // Filter eligible movies (exclude watchlisted and dimension-excluded)
  let eligible = watchedMovies.filter(
    (m) => !watchlistedIds.has(m.mediaId) && !excludedIds.has(m.mediaId)
  );

  // Fallback: if fewer than 2 non-watchlisted movies remain, include watchlisted movies
  // so the arena stays usable when most of the library is on the watchlist
  if (eligible.length < 2) {
    eligible = watchedMovies.filter((m) => !excludedIds.has(m.mediaId));
  }

  if (eligible.length < 2) return null;

  // Sample up to SAMPLE_SIZE movies
  const sampled = eligible.length <= SAMPLE_SIZE ? eligible : shuffleAndTake(eligible, SAMPLE_SIZE);

  // Get scores for sampled movies in this dimension
  const movieIds = sampled.map((m) => m.mediaId);
  const placeholders = movieIds.map(() => '?').join(',');
  const scoreRows = rawDb
    .prepare(
      `SELECT media_id as mediaId, score, comparison_count as comparisonCount
       FROM media_scores
       WHERE dimension_id = ? AND media_type = 'movie' AND media_id IN (${placeholders})`
    )
    .all(selectedDimId, ...movieIds) as Array<{
    mediaId: number;
    score: number;
    comparisonCount: number;
  }>;

  const scoreMap = new Map<number, { score: number; comparisonCount: number }>();
  for (const row of scoreRows) {
    scoreMap.set(row.mediaId, { score: row.score, comparisonCount: row.comparisonCount });
  }

  // Get pair comparison counts for this dimension
  const pairCountRows = rawDb
    .prepare(
      `SELECT media_a_id as mediaAId, media_b_id as mediaBId, COUNT(*) as cnt
       FROM comparisons
       WHERE dimension_id = ? AND media_a_type = 'movie' AND media_b_type = 'movie'
         AND media_a_id IN (${placeholders}) AND media_b_id IN (${placeholders})
       GROUP BY media_a_id, media_b_id`
    )
    .all(selectedDimId, ...movieIds, ...movieIds) as Array<{
    mediaAId: number;
    mediaBId: number;
    cnt: number;
  }>;

  const pairCountMap = new Map<string, number>();
  for (const row of pairCountRows) {
    const key1 = `${row.mediaAId}-${row.mediaBId}`;
    const key2 = `${row.mediaBId}-${row.mediaAId}`;
    const existing = pairCountMap.get(key1) ?? 0;
    pairCountMap.set(key1, existing + row.cnt);
    pairCountMap.set(key2, existing + row.cnt);
  }

  // Build candidate movie objects
  const candidates: CandidateMovie[] = [];
  const movieMetaRows = rawDb
    .prepare(
      `SELECT id, title, poster_path as posterPath, tmdb_id as tmdbId, poster_override_path as posterOverridePath
       FROM movies WHERE id IN (${placeholders})`
    )
    .all(...movieIds) as Array<{
    id: number;
    title: string;
    posterPath: string | null;
    tmdbId: number;
    posterOverridePath: string | null;
  }>;

  const metaMap = new Map(movieMetaRows.map((r) => [r.id, r]));
  const watchDateMap = new Map(sampled.map((m) => [m.mediaId, m.lastWatchedAt]));

  for (const movieId of movieIds) {
    const meta = metaMap.get(movieId);
    if (!meta) continue;

    const lastWatch = watchDateMap.get(movieId);
    const daysSince = lastWatch
      ? Math.max(0, (Date.now() - new Date(lastWatch).getTime()) / (1000 * 60 * 60 * 24))
      : 365; // default to a year if unknown

    const scoreInfo = scoreMap.get(movieId);
    const staleness = getStaleness('movie', movieId);

    candidates.push({
      id: movieId,
      title: meta.title,
      posterPath: meta.posterPath,
      tmdbId: meta.tmdbId,
      posterOverridePath: meta.posterOverridePath,
      score: scoreInfo?.score ?? 1500,
      comparisonCount: scoreInfo?.comparisonCount ?? 0,
      daysSinceLastWatch: daysSince,
      staleness,
    });
  }

  if (candidates.length < 2) return null;

  // Generate candidate pairs and score them
  const scoredPairs: ScoredPair[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (!a || !b) continue;

      // Skip pairs on cooloff
      if (cooloffPairs.has(`${a.id}-${b.id}`)) continue;

      const pairKey = `${a.id}-${b.id}`;
      const pairCount = pairCountMap.get(pairKey) ?? 0;

      const infoGain = informationGain(a.score, b.score, pairCount);
      const recA = recencyWeight(a.daysSinceLastWatch);
      const recB = recencyWeight(b.daysSinceLastWatch);
      const staleA = a.staleness;
      const staleB = b.staleness;
      // Boost pairs where either movie has low confidence on this dimension.
      // confidenceNeed is 1.0 at 0 comparisons, ~0.71 at 1, ~0.5 at 3, ~0.18 at 30.
      // Use max so a single under-compared movie is enough to boost the pair.
      const confNeed = Math.max(
        1 - calculateConfidence(a.comparisonCount),
        1 - calculateConfidence(b.comparisonCount)
      );
      const jitter = 0.7 + Math.random() * 0.6; // [0.7, 1.3]

      const priority = infoGain * recA * recB * staleA * staleB * confNeed * jitter;
      scoredPairs.push({ movieA: a, movieB: b, priority });
    }
  }

  // Fallback: if no scored pairs (all on cooloff), pick any eligible pair
  if (scoredPairs.length === 0) {
    if (candidates.length >= 2) {
      const a = candidates[0];
      const b = candidates[1];
      if (a && b) return { ...buildRandomPairResult(a, b), dimensionId: selectedDimId };
    }
    return null;
  }

  // Weighted random sample from scored pairs
  const selected = weightedRandomSample(scoredPairs.map((p) => ({ item: p, weight: p.priority })));

  if (!selected) return null;

  return { ...buildRandomPairResult(selected.movieA, selected.movieB), dimensionId: selectedDimId };
}
