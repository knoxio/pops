/**
 * Entry point for the inventory pillar HTTP server.
 *
 * Phase 3 PR 1 of the inventory pillar migration boots the process
 * with the minimal `/health` + `/pillars` surface so the new container
 * can be wired into docker-compose + Watchtower without depending on
 * the (still-unfinished) tRPC + URI-dispatcher migration.
 *
 * The process opens its OWN `inventory.db` connection via
 * `openInventoryDb` rather than reaching back into pops-api's
 * singleton — that's the whole point of phase 3.
 */
import { openInventoryDb } from '@pops/inventory-db';

import { createInventoryApiApp } from './app.js';
import { resolveInventorySqlitePath } from './inventory-sqlite-path.js';
import { parseBareOrigin } from './pillars/env.js';

function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3002;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[inventory-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';
// Normalise INVENTORY_SELF_BASE_URL (or the localhost fallback) through
// the shared bare-origin parser so a misconfigured env crashes boot
// loudly instead of publishing an invalid PillarRegistryEntry.baseUrl
// that breaks downstream consumers appending `/uri/resolve`, `/health`,
// etc.
const selfBaseUrl = parseBareOrigin(
  'INVENTORY_SELF_BASE_URL',
  process.env['INVENTORY_SELF_BASE_URL'] ?? `http://localhost:${port}`
);

const inventoryDb = openInventoryDb(resolveInventorySqlitePath());
const app = createInventoryApiApp({ inventoryDb, version, selfBaseUrl });

const server = app.listen(port, () => {
  console.warn(`[inventory-api] Listening on port ${port}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[inventory-api] Shutting down (${signal})`);
  server.close(() => {
    inventoryDb.raw.close();
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
