/**
 * Entry point for the cerebrum pillar HTTP server.
 *
 * Phase 3 PR 1 of the cerebrum pillar migration boots the process with
 * the minimal `/health` surface so the new container can be wired into
 * docker-compose + Watchtower without depending on the (still-unfinished)
 * tRPC + URI-dispatcher migration.
 *
 * The process opens its OWN cerebrum.db connection via `openCerebrumDb`
 * rather than reaching back into pops-api's singleton — that's the
 * whole point of phase 3.
 */
import { openCerebrumDb } from '@pops/cerebrum-db';

import { createCerebrumApiApp } from './app.js';
import { resolveCerebrumSqlitePath } from './cerebrum-sqlite-path.js';

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
const app = createCerebrumApiApp({ cerebrumDb, version });

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
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
