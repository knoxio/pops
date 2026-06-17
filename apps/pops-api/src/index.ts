import { config } from 'dotenv';

// Load .env from CWD (apps/pops-api/ when run via mise/pnpm, or repo root)
// Also check repo root .env as fallback for monorepo setups
config(); // loads apps/pops-api/.env if it exists
config({ path: '../../.env', override: false }); // loads root .env without overriding

import { createApp } from './app.js';
import { backfillCoreFromSharedDb, closeDb, getCoreDrizzle } from './db.js';
import { backfillCerebrumFromSharedDb, getCerebrumDrizzle } from './db/cerebrum-handle.js';
import { getFinanceDrizzle } from './db/finance-handle.js';
import { getInventoryDrizzle } from './db/inventory-handle.js';
import { getListsDrizzle } from './db/lists-handle.js';
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
import { getRedisClient, shutdownRedis } from './redis.js';

const port = Number(process.env['PORT'] ?? 3000);
const app = createApp();

// Eagerly open the core pillar's SQLite + apply its journal at boot so
// the per-pillar migrations land before any request hits the API. PRD-186
// PR4 lands `ai_model_pricing`, `sync_job_results`, and `ai_usage` in
// core.db; the writers still target the shared pops.db until the next
// hot-path cutover PR flips them to `getCoreDrizzle()`, so the one-shot
// `backfillCoreFromSharedDb` bridge carries any rows already written to
// pops.db across each boot. It's idempotent (per-table `WHERE NOT EXISTS
// (...)` filters) and non-fatal (partial failure logs + continues).
// Retire the bridge once the cutover lands and is verified in prod.
try {
  getCoreDrizzle();
  backfillCoreFromSharedDb(resolveSqlitePath());
} catch (err) {
  console.error('[db] Failed to bootstrap the core pillar SQLite:', err);
  throw err;
}

// Eagerly open the inventory pillar's SQLite + apply its journal at
// boot. Every inventory-owned table (locations, home_inventory,
// fixtures, item_connections, item_documents, item_photos,
// item_uploaded_files, item_fixture_connections) now writes directly
// to inventory.db via getInventoryDrizzle(), so the boot-time ATTACH
// bridge from the shared pops.db has been retired — there is nothing
// left to carry forward.
try {
  getInventoryDrizzle();
} catch (err) {
  console.error('[db] Failed to bootstrap the inventory pillar SQLite:', err);
  throw err;
}

// Eagerly open the finance pillar's SQLite + apply its journal at boot.
// Every finance-owned table (`entities`, `transactions`,
// `transaction_corrections`, `transaction_tag_rules`, `tag_vocabulary`,
// `budgets`, `wish_list`) now writes directly to finance.db via
// getFinanceDrizzle(), so the boot-time ATTACH bridge from the shared
// pops.db has been retired — there is nothing left to carry forward.
try {
  getFinanceDrizzle();
} catch (err) {
  console.error('[db] Failed to bootstrap the finance pillar SQLite:', err);
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

// Eagerly open the lists pillar's SQLite + apply its journal at boot.
// Every lists-owned table (`lists` + `list_items`) now writes directly
// to lists.db via getListsDrizzle(), so the boot-time ATTACH bridge
// from the shared pops.db has been retired — there is nothing left to
// carry forward.
try {
  getListsDrizzle();
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
  // 2. Stop Thalamus file watcher
  await stopThalamus();
  await unregisterAiLogRetentionScheduler();
  await unregisterAiAlertsScheduler();
  await unregisterAiObservabilitySummaryScheduler();
  // 3. Stop TTL watcher
  clearInterval(ttlWatcher);
  // 4. Close BullMQ queue connections
  await closeQueues();
  // 5. Close Redis
  await shutdownRedis();
  // 6. Close DB
  closeDb();
  // 7. Exit
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
