/**
 * Discovery db-service barrel — the pure, HTTP-free persistence + scoring layer
 * for the discover surface (preference profile, flag sets, library/rewatch
 * queries, dimension + seed selects, and local-shelf queries).
 *
 * Ported from the monolith `media/discovery/service*.ts` + the per-shelf query
 * helpers. The TMDB/Plex orchestration that calls upstream clients lives in
 * `api/modules/discovery/`; everything here is `(db, …)`-arg.
 */
export type {
  DimensionWeight,
  DiscoverResult,
  GenreAffinity,
  GenreDistribution,
  PreferenceProfile,
  QuickPickMovie,
  RewatchSuggestion,
  ScoredDiscoverResult,
} from './types.js';
export { TMDB_GENRE_MAP } from './types.js';

export { getPreferenceProfile } from './preference-profile.js';
export { scoreDiscoverResults } from './scoring.js';
export { getLibraryTmdbIdSet, getWatchedTmdbIdSet, getWatchlistTmdbIdSet } from './flag-sets.js';
export { getUnwatchedLibraryMovies } from './library-queries.js';
export { getRewatchSuggestions } from './rewatch.js';

export type { DimensionSeedMovie, DimensionTopMovie } from './dimension-queries.js';
export { getHighScoringMovieForDimension, getTopMoviesForDimension } from './dimension-queries.js';

export type { EloSeedMovie, SourceMovie, WatchedSeedMovie } from './seed-queries.js';
export {
  getEloSeedMovies,
  getMostWatchedDecade,
  getRecentWatchlistSourceMovies,
  getTopRatedSourceMovies,
  getWatchedSeeds,
} from './seed-queries.js';

export { getFriendProofMovies, getPolarizingMovies } from './local-score-queries.js';
export {
  getComfortPicks,
  getRecentlyAddedMovies,
  getUndiscoveredMovies,
} from './local-watch-queries.js';
export {
  getFranchiseCompletions,
  getLeavingSoonMovies,
  getLongEpics,
  getShortWatches,
  getWatchedGenres,
  hasLeavingMovies,
} from './local-misc-queries.js';
