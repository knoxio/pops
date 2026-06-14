import { openCoreDb } from '@pops/core-db';
import { openFinanceDb } from '@pops/finance-db';
/**
 * Entry point for the finance pillar HTTP server.
 *
 * Phase 3 PR 1 scaffolded the minimal `/health` surface. Phase 5 PR 1
 * (Track M2) opens both `finance.db` (for writes) and a handle to the
 * shared `core.db` (for service-account auth) and wires them into the
 * Express app factory. `openCoreDb` runs migrations on open so the
 * core handle is read/write at the SQLite level even though finance-api
 * only issues reads against it.
 *
 * The process opens its OWN `finance.db` connection via `openFinanceDb`
 * rather than reaching back into pops-api's singleton — that's the
 * whole point of phase 3. Mirrors `apps/pops-media-api/src/server.ts`
 * and `apps/pops-inventory-api/src/server.ts`.
 *
 * Theme 13 PRD-158 adds an opt-in registry handshake via
 * `bootstrapPillar`. When `POPS_REGISTRY_ENABLED=true`, the process
 * builds a hand-rolled finance manifest (PRD-155 will generate this
 * later) and registers with the central registry on boot. SIGTERM
 * triggers `runtime.stop()` so the heartbeat clears and the registry
 * sees an explicit deregister.
 */
import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

import { createFinanceApiApp } from './app.js';
import { resolveCoreSqlitePath } from './core-sqlite-path.js';
import { resolveFinanceSqlitePath } from './finance-sqlite-path.js';
import { buildFinanceManifest } from './manifest.js';

function resolvePort(): number {
  // 3001 is core-api, 3002 is inventory-api, 3003 is media-api,
  // 3004 is finance-api.
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3004;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[finance-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? '0.1.0';

const financeDb = openFinanceDb(resolveFinanceSqlitePath());
const coreDb = openCoreDb(resolveCoreSqlitePath());
const app = createFinanceApiApp({ financeDb, coreDb, version });

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({ manifest: buildFinanceManifest(version) });
}

const server = app.listen(port, () => {
  console.warn(`[finance-api] Listening on port ${port}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[finance-api] Shutting down (${signal})`);
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close(() => {
      financeDb.raw.close();
      coreDb.raw.close();
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
