/**
 * Entry point for the media pillar HTTP server.
 *
 * Phase 3 PR 1 of the media pillar migration boots the process with the
 * minimal `/health` surface so the new container can be wired into
 * docker-compose + Watchtower without depending on the (still-unfinished)
 * tRPC + URI-dispatcher migration.
 *
 * The process opens its OWN `media.db` connection via `openMediaDb`
 * rather than reaching back into pops-api's singleton — that's the whole
 * point of phase 3. Mirrors `apps/pops-core-api/src/server.ts`.
 */
import { openMediaDb } from '@pops/media-db';

import { createMediaApiApp } from './app.js';
import { resolveMediaSqlitePath } from './media-sqlite-path.js';

function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3002;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[media-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';

const mediaDb = openMediaDb(resolveMediaSqlitePath());
const app = createMediaApiApp({ mediaDb, version });

const server = app.listen(port, () => {
  console.warn(`[media-api] Listening on port ${port}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[media-api] Shutting down (${signal})`);
  server.close(() => {
    mediaDb.raw.close();
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
