import { config } from 'dotenv';

// Load .env from CWD (apps/pops-api/ when run via mise/pnpm, or repo root)
// Also check repo root .env as fallback for monorepo setups
config(); // loads apps/pops-api/.env if it exists
config({ path: '../../.env', override: false }); // loads root .env without overriding

import { createApp } from './app.js';
import { closeDb } from './db.js';
import { closeQueues } from './jobs/queues.js';
import { startThalamus, stopThalamus } from './modules/cerebrum/thalamus/instance.js';
import { startupCleanup } from './modules/core/envs/registry.js';
import { startTtlWatcher } from './modules/core/envs/ttl-watcher.js';
import { resumeSchedulerIfEnabled, stopPlexSchedulerTask } from './modules/media/plex/scheduler.js';
import {
  resumeRotationSchedulerIfEnabled,
  stopRotationTask,
  waitForCycleEnd,
} from './modules/media/rotation/scheduler.js';
import { getRedisClient, shutdownRedis } from './redis.js';

const port = Number(process.env['PORT'] ?? 3000);
const app = createApp();

// Clean up expired and orphaned env DBs left over from any previous crash
const { expired, orphaned } = startupCleanup();
if (expired.length > 0)
  console.warn(`[pops-api] Cleaned up ${expired.length} expired env(s): ${expired.join(', ')}`);
if (orphaned.length > 0)
  console.warn(`[pops-api] Removed ${orphaned.length} orphaned env DB(s): ${orphaned.join(', ')}`);

const server = app.listen(port, () => {
  console.warn(`[pops-api] Listening on port ${port}`);
});

// Auto-resume Plex sync scheduler if it was previously running
const resumedScheduler = resumeSchedulerIfEnabled();
if (resumedScheduler) {
  console.warn(`[pops-api] Plex scheduler resumed (interval: ${resumedScheduler.intervalMs}ms)`);
}

// Auto-resume rotation scheduler if it was previously running
const resumedRotation = resumeRotationSchedulerIfEnabled();
if (resumedRotation) {
  console.warn(`[pops-api] Rotation scheduler resumed (cron: ${resumedRotation.cronExpression})`);
}

// Initiate Redis connection eagerly so /health reports accurately (lazyConnect defers otherwise)
getRedisClient()
  ?.connect()
  .catch(() => {}); // ioredis auto-reconnects; suppress initial connection errors

// Periodically purge expired named environments
const ttlWatcher = startTtlWatcher();

// Start Thalamus file watcher (Cerebrum indexing middleware)
startThalamus().catch((err) => {
  console.error('[thalamus] Failed to start:', err);
});

async function shutdown(signal: string): Promise<void> {
  console.warn(`[pops-api] ${signal} — shutting down`);
  // 1. Stop accepting new requests
  server.close();
  // 2. Stop schedulers (preserve settings for auto-resume on restart)
  stopRotationTask();
  stopPlexSchedulerTask();
  // 3. Stop Thalamus file watcher
  await stopThalamus();
  // 4. Wait for any in-progress rotation cycle to finish
  if (process.env['NODE_ENV'] !== 'test') {
    await waitForCycleEnd();
  }
  // 5. Stop TTL watcher
  clearInterval(ttlWatcher);
  // 6. Close BullMQ queue connections
  await closeQueues();
  // 7. Close Redis
  await shutdownRedis();
  // 8. Close DB
  closeDb();
  // 9. Exit
  process.exit(0);
}

process.once('SIGTERM', () => {
  shutdown('SIGTERM').catch((err) => {
    console.error('[pops-api] Shutdown error:', err);
    process.exit(1);
  });
});
process.once('SIGINT', () => {
  shutdown('SIGINT').catch((err) => {
    console.error('[pops-api] Shutdown error:', err);
    process.exit(1);
  });
});
