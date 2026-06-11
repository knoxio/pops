/**
 * Entry point for the cerebrum pillar HTTP server.
 *
 * Phase 3 PR 1 of the cerebrum pillar migration boots the process with
 * the minimal `/health` surface; Phase 5 PR 1 (Track M5) adds the tRPC
 * handler at `/trpc` for the nudge_log read/dismiss surface.
 *
 * The process opens its OWN cerebrum.db AND core.db connections rather
 * than reaching back into pops-api's singletons — that's the whole
 * point of phase 3. core.db is required because the canonical
 * `service_accounts` table that backs `X-API-Key` authentication lives
 * on the core pillar. The core.db handle MUST be writable — auth
 * touches `service_accounts.last_used_at` per request and `openCoreDb`
 * applies migrations at boot.
 */
import { openCerebrumDb } from '@pops/cerebrum-db';
import { openCoreDb } from '@pops/core-db';

import { createCerebrumApiApp } from './app.js';
import { resolveCerebrumSqlitePath } from './cerebrum-sqlite-path.js';
import { resolveCoreSqlitePath } from './core-sqlite-path.js';

function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3007;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[cerebrum-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';

const cerebrumDb = openCerebrumDb(resolveCerebrumSqlitePath());
const coreDb = openCoreDb(resolveCoreSqlitePath());
const app = createCerebrumApiApp({ cerebrumDb, coreDb, version });

const server = app.listen(port, () => {
  console.warn(`[cerebrum-api] Listening on port ${port}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[cerebrum-api] Shutting down (${signal})`);
  server.close(() => {
    cerebrumDb.raw.close();
    coreDb.raw.close();
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
