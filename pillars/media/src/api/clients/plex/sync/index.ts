/**
 * Barrel for the in-process Plex sync ops + job runner (slice 9b).
 *
 * Deferred: `plexSyncDiscoverWatches` and all `sync-discover-*` ops — they
 * depend on the Plex Discover client + the rotation domain (wave 3).
 */
export { runSyncJob } from './run-sync-job.js';
export {
  SYNC_JOB_TYPES,
  isSyncJobType,
  type StartSyncJobInput,
  type SyncJobType,
} from './types.js';
