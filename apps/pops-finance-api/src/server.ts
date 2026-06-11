/**
 * Entry point for the finance pillar HTTP server.
 *
 * Phase 3 PR 1 scaffolded the minimal `/health` surface. Phase 5 PR 1
 * (Track M2) opens both `finance.db` (for writes) and a read-only
 * handle to the shared `core.db` (for service-account auth) and wires
 * them into the Express app factory.
 *
 * The process opens its OWN `finance.db` connection via `openFinanceDb`
 * rather than reaching back into pops-api's singleton — that's the
 * whole point of phase 3. Mirrors `apps/pops-media-api/src/server.ts`
 * and `apps/pops-inventory-api/src/server.ts`.
 */
import { openCoreDb } from '@pops/core-db';
import { openFinanceDb } from '@pops/finance-db';

import { createFinanceApiApp } from './app.js';
import { resolveCoreSqlitePath } from './core-sqlite-path.js';
import { resolveFinanceSqlitePath } from './finance-sqlite-path.js';

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
const version = process.env['BUILD_VERSION'] ?? 'dev';

const financeDb = openFinanceDb(resolveFinanceSqlitePath());
const coreDb = openCoreDb(resolveCoreSqlitePath());
const app = createFinanceApiApp({ financeDb, coreDb, version });

const server = app.listen(port, () => {
  console.warn(`[finance-api] Listening on port ${port}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[finance-api] Shutting down (${signal})`);
  server.close(() => {
    financeDb.raw.close();
    coreDb.raw.close();
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
