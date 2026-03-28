/**
 * Plex module — API client, sync service, and tRPC router.
 */
export { PlexClient } from "./client.js";
export { plexRouter } from "./router.js";
export {
  PlexApiError,
  type PlexLibrary,
  type PlexMediaItem,
  type PlexEpisode,
  type PlexExternalId,
} from "./types.js";
export { getPlexClient, testConnection, getSyncStatus, type PlexSyncStatus } from "./service.js";
export { importMoviesFromPlex, type MovieSyncProgress } from "./sync-movies.js";
export { importTvShowsFromPlex, type TvSyncProgress, type TvSyncSkip } from "./sync-tv.js";
