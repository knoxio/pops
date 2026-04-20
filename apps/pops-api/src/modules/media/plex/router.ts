/**
 * Plex tRPC router — sync operations and connection management.
 *
 * Sync jobs are enqueued into the pops-sync BullMQ queue (PRD-074).
 * The frontend polls getSyncJobStatus for progress and results.
 *
 * Implementation is split across:
 *  - router-helpers.ts     — sync job types + BullMQ/DB row mappers
 *  - router-connection.ts  — testConnection, getLibraries, setUrl, getPlexUrl
 *  - router-sync.ts        — startSyncJob, getSyncJobStatus, getActiveSyncJobs, getLastSyncResults
 *  - router-scheduler.ts   — scheduler + section IDs
 *  - router-auth.ts        — Plex PIN auth + disconnect
 */
import { router } from '../../../trpc.js';
import { authProcedures } from './router-auth.js';
import { connectionProcedures } from './router-connection.js';
import { schedulerProcedures } from './router-scheduler.js';
import { syncProcedures } from './router-sync.js';

export {
  SYNC_JOB_TYPES,
  type SyncJob,
  type SyncJobProgress,
  type SyncJobType,
} from './router-helpers.js';

export const plexRouter = router({
  ...connectionProcedures,
  ...syncProcedures,
  ...schedulerProcedures,
  ...authProcedures,
});
