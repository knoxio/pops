import { config } from 'dotenv';

// Load .env from CWD (apps/pops-api/ when run via mise/pnpm, or repo root)
// Also check repo root .env as fallback for monorepo setups
config(); // loads apps/pops-api/.env if it exists
config({ path: '../../.env', override: false }); // loads root .env without overriding

import { createApp } from './app.js';
import { closeDb, getCoreDrizzle } from './db.js';
import { backfillCerebrumFromSharedDb, getCerebrumDrizzle } from './db/cerebrum-handle.js';
import { backfillFinanceFromSharedDb, getFinanceDrizzle } from './db/finance-handle.js';
import { getFoodDrizzle } from './db/food-handle.js';
import { backfillInventoryFromSharedDb, getInventoryDrizzle } from './db/inventory-handle.js';
import { backfillListsFromSharedDb, getListsDrizzle } from './db/lists-handle.js';
import { backfillMediaFromShared, getMediaDrizzle } from './db/media-db-handle.js';
import { resolveSqlitePath } from './db/sqlite-path.js';
import { closeQueues } from './jobs/queues.js';
import { startThalamus, stopThalamus } from './modules/cerebrum/thalamus/instance.js';
import {
  registerAiAlertsScheduler,
  unregisterAiAlertsScheduler,
} from './modules/core/ai-alerts/scheduler.js';
import { migrateLegacyBudgetSettings } from './modules/core/ai-budgets/service.js';
import {
  registerAiLogRetentionScheduler,
  unregisterAiLogRetentionScheduler,
} from './modules/core/ai-observability/scheduler.js';
import {
  registerAiObservabilitySummaryScheduler,
  unregisterAiObservabilitySummaryScheduler,
} from './modules/core/ai-observability/summary-scheduler.js';
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

// Eagerly open the core pillar's SQLite + apply its journal at boot so
// the per-pillar migrations land before any request hits the API. After
// the theme-13 core PR4 drop wave (service_accounts / settings /
// ai-usage tables), every core-owned slice writes directly to core.db
// and no bridge from the shared pops.db remains.
try {
  getCoreDrizzle();
} catch (err) {
  console.error('[db] Failed to bootstrap the core pillar SQLite:', err);
  throw err;
}

// Eagerly open the inventory pillar's SQLite + apply its journal at
// boot. All inventory module traffic now reads/writes against this
// handle (phase 2 PR 3); the one-shot `backfillInventoryFromSharedDb`
// carries any rows that still live in the legacy pops.db across.
// The backfill is idempotent (per-table `WHERE id NOT IN (...)`
// filters) and non-fatal (partial failure logs + continues).
try {
  getInventoryDrizzle();
  backfillInventoryFromSharedDb(resolveSqlitePath());
} catch (err) {
  console.error('[db] Failed to bootstrap the inventory pillar SQLite:', err);
  throw err;
}

// Eagerly open the finance pillar's SQLite + apply its journal at
// boot. The wish-list slice now reads/writes against this handle
// (phase 2 PR 3); the one-shot `backfillFinanceFromSharedDb` carries
// any rows that still live in the legacy pops.db across. The backfill
// is idempotent (per-table `WHERE id NOT IN (...)` filters) and
// non-fatal (partial failure logs + continues).
try {
  getFinanceDrizzle();
  backfillFinanceFromSharedDb(resolveSqlitePath());
} catch (err) {
  console.error('[db] Failed to bootstrap the finance pillar SQLite:', err);
  throw err;
}

// Eagerly open the media pillar's SQLite + apply its journal at boot so
// the per-pillar migrations land before any request hits the API.
// shelf-impressions traffic now reads/writes against this handle (phase 2
// PR 3); the one-shot `backfillMediaFromShared` carries any rows that
// still live in the legacy pops.db across. The backfill is idempotent
// and non-fatal — partial failure logs and continues.
try {
  getMediaDrizzle();
  backfillMediaFromShared();
} catch (err) {
  console.error('[db] Failed to bootstrap the media pillar SQLite:', err);
  throw err;
}

// Eagerly open the cerebrum pillar's SQLite + apply its journal at
// boot. The nudge_log slice now reads/writes against this handle
// (phase 2 PR 3); the one-shot `backfillCerebrumFromSharedDb` carries
// any rows that still live in the legacy pops.db across. The backfill
// is idempotent (per-table `WHERE id NOT IN (...)` filters) and
// non-fatal (partial failure logs + continues).
try {
  getCerebrumDrizzle();
  backfillCerebrumFromSharedDb(resolveSqlitePath());
} catch (err) {
  console.error('[db] Failed to bootstrap the cerebrum pillar SQLite:', err);
  throw err;
}

// Eagerly open the food pillar's SQLite + apply its journal at boot.
// Every food-owned table (prep_states + the kind='prep_state' slice of
// slug_registry) now writes directly to food.db via getFoodDrizzle(),
// so the boot-time ATTACH bridge from the shared pops.db has been
// retired — there is nothing left to carry forward.
try {
  getFoodDrizzle();
} catch (err) {
  console.error('[db] Failed to bootstrap the food pillar SQLite:', err);
  throw err;
}

// Eagerly open the lists pillar's SQLite + apply its journal at boot.
// Every lists module read + write now resolves against this handle
// (phase 2 PR 3); the one-shot `backfillListsFromSharedDb` carries any
// `lists` + `list_items` rows that still live in the legacy pops.db
// across. The backfill is idempotent (per-table `WHERE id NOT IN (...)`
// filters) and non-fatal (partial failure logs + continues).
try {
  getListsDrizzle();
  backfillListsFromSharedDb(resolveSqlitePath());
} catch (err) {
  console.error('[db] Failed to bootstrap the lists pillar SQLite:', err);
  throw err;
}

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

// Convert legacy `ai.monthlyTokenBudget` / `ai.budgetExceededFallback`
// settings into a row in `ai_budgets` (PRD-092 US-04). Idempotent.
try {
  migrateLegacyBudgetSettings();
} catch (err) {
  console.error('[ai-budgets] Legacy settings migration failed:', err);
}

// Register AI inference log retention scheduler (PRD-092 US-08)
registerAiLogRetentionScheduler().catch((err: unknown) => {
  console.error('[ai-retention] Failed to register scheduler:', err);
});

// Register AI alert evaluator scheduler (PRD-092 US-07)
registerAiAlertsScheduler().catch((err: unknown) => {
  console.error('[ai-alerts] Failed to register scheduler:', err);
});

// Register AI observability summary scheduler (PRD-092 US-05)
registerAiObservabilitySummaryScheduler().catch((err: unknown) => {
  console.error('[ai-observability-summary] Failed to register scheduler:', err);
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
  await unregisterAiLogRetentionScheduler();
  await unregisterAiAlertsScheduler();
  await unregisterAiObservabilitySummaryScheduler();
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
