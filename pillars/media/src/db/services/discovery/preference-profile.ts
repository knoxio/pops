/**
 * Preference-profile builder — composes the four aggregations in
 * `profile-queries.ts` into the {@link PreferenceProfile} that drives scoring,
 * genre spotlight, and shelf generation.
 */
import {
  getDimensionWeights,
  getGenreAffinities,
  getGenreDistribution,
  getTotalComparisons,
} from './profile-queries.js';

import type { MediaDb } from '../internal.js';
import type { PreferenceProfile } from './types.js';

/** Compute the full preference profile on demand from the media db. */
export function getPreferenceProfile(db: MediaDb): PreferenceProfile {
  const genreAffinities = getGenreAffinities(db);
  const dimensionWeights = getDimensionWeights(db);
  const { genres: genreDistribution, totalWatched } = getGenreDistribution(db);
  const totalComparisons = getTotalComparisons(db);
  return {
    genreAffinities,
    dimensionWeights,
    genreDistribution,
    totalMoviesWatched: totalWatched,
    totalComparisons,
  };
}
