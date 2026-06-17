/**
 * Smart-pair selection — two-stage weighted-probabilistic pick of a movie pair
 * for comparison. HTTP-free, `(db, …)` arg.
 */
import { getDimension } from '../dimensions.js';
import {
  buildCandidates,
  fetchCooloffPairs,
  fetchExcludedIds,
  fetchMovieMetaMap,
  fetchPairCountMap,
  fetchScoreMap,
  fetchWatchedMovies,
  fetchWatchlistedIds,
  pickDimensionByNeed,
  SAMPLE_SIZE,
  shuffleAndTake,
  type CandidateMovie,
  type WatchedMovie,
} from './smart-pair-helpers.js';
import { buildScoredPairs, weightedRandomSample } from './smart-pair-scoring.js';

import type { MediaDb } from '../../internal.js';
import type { RandomPair, SmartPairResult } from '../mappers.js';

function buildRandomPairResult(a: CandidateMovie, b: CandidateMovie): RandomPair {
  const resolvePoster = (c: CandidateMovie): string | null => {
    if (c.posterOverridePath) return c.posterOverridePath;
    if (c.posterPath) return `/media/images/movie/${c.tmdbId}/poster.jpg`;
    return null;
  };
  return {
    movieA: { id: a.id, title: a.title, posterPath: a.posterPath, posterUrl: resolvePoster(a) },
    movieB: { id: b.id, title: b.title, posterPath: b.posterPath, posterUrl: resolvePoster(b) },
  };
}

function selectEligible(
  watchedMovies: WatchedMovie[],
  watchlistedIds: Set<number>,
  excludedIds: Set<number>
): WatchedMovie[] {
  let eligible = watchedMovies.filter(
    (m) => !watchlistedIds.has(m.mediaId) && !excludedIds.has(m.mediaId)
  );
  if (eligible.length < 2) {
    eligible = watchedMovies.filter((m) => !excludedIds.has(m.mediaId));
  }
  return eligible;
}

function buildCandidatesForDimension(
  db: MediaDb,
  selectedDimId: number,
  watchedMovies: WatchedMovie[]
): CandidateMovie[] {
  const watchlistedIds = fetchWatchlistedIds(db);
  const excludedIds = fetchExcludedIds(db, selectedDimId);
  const eligible = selectEligible(watchedMovies, watchlistedIds, excludedIds);
  if (eligible.length < 2) return [];

  const sampled = eligible.length <= SAMPLE_SIZE ? eligible : shuffleAndTake(eligible, SAMPLE_SIZE);
  const movieIds = sampled.map((m) => m.mediaId);
  const scoreMap = fetchScoreMap(db, selectedDimId, movieIds);
  const metaMap = fetchMovieMetaMap(db, movieIds);
  const watchDateMap = new Map(sampled.map((m) => [m.mediaId, m.lastWatchedAt]));
  return buildCandidates({ db, movieIds, metaMap, watchDateMap, scoreMap });
}

function pickPairFromCandidates(
  candidates: CandidateMovie[],
  cooloffPairs: Set<string>,
  pairCountMap: Map<string, number>
): { a: CandidateMovie; b: CandidateMovie } | null {
  if (candidates.length < 2) return null;
  const scoredPairs = buildScoredPairs({ candidates, cooloffPairs, pairCountMap });

  if (scoredPairs.length === 0) {
    const a = candidates[0];
    const b = candidates[1];
    if (a && b) return { a, b };
    return null;
  }

  const selected = weightedRandomSample(scoredPairs.map((p) => ({ item: p, weight: p.priority })));
  if (!selected) return null;
  return { a: selected.movieA, b: selected.movieB };
}

/**
 * Get a smart pair via two-stage weighted-probabilistic selection:
 *   1. pick a dimension by need (skipped when `dimensionId` is given),
 *   2. sample eligible movies, score candidate pairs, weighted-random sample.
 * Returns null when there aren't enough eligible movies (the caller falls back
 * to a random pair).
 */
export function getSmartPair(db: MediaDb, dimensionId?: number): SmartPairResult | null {
  const selectedDimId = dimensionId ?? pickDimensionByNeed(db);
  if (selectedDimId === null) return null;
  getDimension(db, selectedDimId);

  const watchedMovies = fetchWatchedMovies(db);
  const candidates = buildCandidatesForDimension(db, selectedDimId, watchedMovies);
  if (candidates.length < 2) return null;

  const movieIds = candidates.map((c) => c.id);
  const cooloffPairs = fetchCooloffPairs(db, selectedDimId);
  const pairCountMap = fetchPairCountMap(db, selectedDimId, movieIds);

  const pair = pickPairFromCandidates(candidates, cooloffPairs, pairCountMap);
  if (!pair) return null;
  return { ...buildRandomPairResult(pair.a, pair.b), dimensionId: selectedDimId };
}
