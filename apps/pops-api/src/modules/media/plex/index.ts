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
export {
  getPlexClient,
  testConnection,
  syncMovies,
  syncTvShows,
  getSyncStatus,
  type SyncResult,
  type SyncError,
  type PlexSyncStatus,
} from "./service.js";
