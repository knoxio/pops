import { getDb } from '../../../../db.js';
import { getDimension } from '../dimensions.service.js';
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

import type { RandomPair, SmartPairResult } from '../types.js';

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
  selectedDimId: number,
  watchedMovies: WatchedMovie[]
): CandidateMovie[] {
  const watchlistedIds = fetchWatchlistedIds();
  const excludedIds = fetchExcludedIds(selectedDimId);
  const eligible = selectEligible(watchedMovies, watchlistedIds, excludedIds);
  if (eligible.length < 2) return [];

  const sampled = eligible.length <= SAMPLE_SIZE ? eligible : shuffleAndTake(eligible, SAMPLE_SIZE);
  const movieIds = sampled.map((m) => m.mediaId);
  const scoreMap = fetchScoreMap(selectedDimId, movieIds);
  const metaMap = fetchMovieMetaMap(movieIds);
  const watchDateMap = new Map(sampled.map((m) => [m.mediaId, m.lastWatchedAt]));
  return buildCandidates({ movieIds, metaMap, watchDateMap, scoreMap });
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
 * Get a smart pair of watched movies for comparison using weighted probabilistic selection.
 *
 * Two-stage selection:
 * 1. Pick dimension by dimensionNeed (weighted random)
 * 2. Within dimension, sample eligible movies, generate candidate pairs, score, weighted random sample
 */
export function getSmartPair(dimensionId?: number): SmartPairResult | null {
  const rawDb = getDb();
  const selectedDimId = dimensionId ?? pickDimensionByNeed(rawDb);
  if (selectedDimId === null) return null;
  getDimension(selectedDimId);

  const watchedMovies = fetchWatchedMovies();
  const candidates = buildCandidatesForDimension(selectedDimId, watchedMovies);
  if (candidates.length < 2) return null;

  const movieIds = candidates.map((c) => c.id);
  const cooloffPairs = fetchCooloffPairs(selectedDimId);
  const pairCountMap = fetchPairCountMap(selectedDimId, movieIds);

  const pair = pickPairFromCandidates(candidates, cooloffPairs, pairCountMap);
  if (!pair) return null;
  return { ...buildRandomPairResult(pair.a, pair.b), dimensionId: selectedDimId };
}
