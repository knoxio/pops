/**
 * Entry point for the core pillar HTTP server.
 *
 * Phase 3 PR 1 of the core pillar migration boots the process with the
 * minimal `/health` surface so the new container can be wired into
 * docker-compose + Watchtower without depending on the (still-unfinished)
 * tRPC + URI-dispatcher migration.
 *
 * The process opens its OWN core.db connection via `openCoreDb` rather
 * than reaching back into pops-api's singleton — that's the whole point
 * of phase 3.
 */
import { openCoreDb } from '@pops/core-db';

import { createCoreApiApp } from './app.js';
import { resolveCoreSqlitePath } from './core-sqlite-path.js';

function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3001;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[core-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';

const coreDb = openCoreDb(resolveCoreSqlitePath());
const app = createCoreApiApp({ coreDb, version });

const server = app.listen(port, () => {
  console.warn(`[core-api] Listening on port ${port}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[core-api] Shutting down (${signal})`);
  server.close(() => {
    coreDb.raw.close();
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
