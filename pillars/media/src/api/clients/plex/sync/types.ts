/**
 * Shared types for the in-process Plex sync ops + job runner (slice 9b).
 *
 * The `plexSyncDiscoverWatches` job type is intentionally absent — it needs
 * the Plex Discover client + the rotation domain, both deferred to wave 3.
 */

/**
 * The sync job types this slice runs. `plexSyncDiscoverWatches` is
 * deliberately excluded (deferred — see module note).
 */
export const SYNC_JOB_TYPES = [
  'plexSyncMovies',
  'plexSyncTvShows',
  'plexSyncWatchlist',
  'plexSyncWatchHistory',
] as const;

export type SyncJobType = (typeof SYNC_JOB_TYPES)[number];

export function isSyncJobType(value: string): value is SyncJobType {
  return (SYNC_JOB_TYPES as readonly string[]).includes(value);
}

/** Start-a-job request shape (mirrors the monolith `startSyncJob` input). */
export interface StartSyncJobInput {
  jobType: SyncJobType;
  sectionId?: string | undefined;
  movieSectionId?: string | undefined;
  tvSectionId?: string | undefined;
}
