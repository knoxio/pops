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
import { reconcileRegistryOnBoot } from './modules/registry/boot.js';
import { startHeartbeatTicker } from './modules/registry/ticker.js';
import { parseBareOrigin } from './pillars/env.js';

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
// Normalise CORE_SELF_BASE_URL (or the localhost fallback) through the
// shared bare-origin parser so a misconfigured env crashes boot loudly
// instead of publishing an invalid PillarRegistryEntry.baseUrl that
// breaks downstream consumers appending `/uri/resolve`, `/health`, etc.
const selfBaseUrl = parseBareOrigin(
  'CORE_SELF_BASE_URL',
  process.env['CORE_SELF_BASE_URL'] ?? `http://localhost:${port}`
);

const coreDb = openCoreDb(resolveCoreSqlitePath());

reconcileRegistryOnBoot(coreDb.db);

const app = createCoreApiApp({ coreDb, version, selfBaseUrl });

const server = app.listen(port, () => {
  console.warn(`[core-api] Listening on port ${port}`);
});

const stopHeartbeatTicker = startHeartbeatTicker(coreDb.db);

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[core-api] Shutting down (${signal})`);
  stopHeartbeatTicker();
  server.close(() => {
    coreDb.raw.close();
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
