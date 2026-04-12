/**
 * Plex module — API client, sync service, and tRPC router.
 */
export { PlexClient } from './client.js';
export { plexRouter } from './router.js';
export { getPlexClient, getSyncStatus, type PlexSyncStatus, testConnection } from './service.js';
export { importMoviesFromPlex, type MovieSyncProgress } from './sync-movies.js';
export { importTvShowsFromPlex, type TvSyncProgress, type TvSyncSkip } from './sync-tv.js';
export {
  PlexApiError,
  type PlexEpisode,
  type PlexExternalId,
  type PlexLibrary,
  type PlexMediaItem,
} from './types.js';
