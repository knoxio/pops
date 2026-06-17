/**
 * Media domain table barrel.
 *
 * Canonical definitions for media-owned tables (comparisons, dismissed
 * discover, episodes, media scores, watchlist, movies, rotation,
 * seasons, shelf impressions, sync logs / job results, TV shows, watch
 * history) live in this package per PRD-245 US-04 (audit H6/H7).
 *
 */
export { comparisonDimensions } from './schema/comparison-dimensions.js';
export { comparisonSkipCooloffs } from './schema/comparison-skip-cooloffs.js';
export { comparisonStaleness } from './schema/comparison-staleness.js';
export { comparisons } from './schema/comparisons.js';
export { dismissedDiscover } from './schema/dismissed-discover.js';
export { episodes } from './schema/episodes.js';
export { mediaScores } from './schema/media-scores.js';
export { mediaWatchlist } from './schema/media-watchlist.js';
export { movies } from './schema/movies.js';
export { plexSettings } from './schema/plex-settings.js';
export { rotationCandidates } from './schema/rotation-candidates.js';
export { rotationExclusions } from './schema/rotation-exclusions.js';
export { rotationLog } from './schema/rotation-log.js';
export { rotationSources } from './schema/rotation-sources.js';
export { seasons } from './schema/seasons.js';
export { shelfImpressions } from './schema/shelf-impressions.js';
export { syncJobResults } from './schema/sync-job-results.js';
export { syncLogs } from './schema/sync-logs.js';
export { tierOverrides } from './schema/tier-overrides.js';
export { tvShows } from './schema/tv-shows.js';
export { watchHistory } from './schema/watch-history.js';
