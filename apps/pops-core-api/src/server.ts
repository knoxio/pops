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

const port = Number(process.env['PORT'] ?? 3001);
const version = process.env['BUILD_VERSION'] ?? 'dev';

const coreDb = openCoreDb(resolveCoreSqlitePath());
const app = createCoreApiApp({ coreDb, version });

const server = app.listen(port, () => {
  console.warn(`[core-api] Listening on port ${port}`);
});

function shutdown(): void {
  console.warn('[core-api] Shutting down');
  server.close(() => {
    coreDb.raw.close();
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
