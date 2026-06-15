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
 *
 * Theme 13 PRD-158 adds an opt-in registry handshake via
 * `bootstrapPillar`. When `POPS_REGISTRY_ENABLED=true`, the process
 * builds a hand-rolled inventory manifest (PRD-155 will generate this
 * later) and registers with the central registry on boot. SIGTERM
 * triggers `pillarHandle.stop()` so the heartbeat clears and the
 * registry sees an explicit deregister.
 */
import { openCoreDb } from '@pops/core-db';
import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

import { openInventoryDb } from '../db/index.js';
import { createInventoryApiApp } from './app.js';
import { resolveCoreSqlitePath } from './core-sqlite-path.js';
import { resolveInventorySqlitePath } from './inventory-sqlite-path.js';
import { buildInventoryManifest } from './manifest.js';
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
// etc. parseBareOrigin throws a PillarsEnvParseError prefixed with
// `POPS_PILLARS:` — fine when the parser is consulted from
// parsePillarsEnv, but misleading when the failing env is actually
// INVENTORY_SELF_BASE_URL. Wrap + rethrow with an inventory-api-scoped
// message so operators look at the right env var.
function resolveSelfBaseUrl(): string {
  const raw = process.env['INVENTORY_SELF_BASE_URL'] ?? `http://localhost:${port}`;
  try {
    return parseBareOrigin('INVENTORY_SELF_BASE_URL', raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[inventory-api] INVENTORY_SELF_BASE_URL ${raw} is invalid — ${message}`, {
      cause: err,
    });
  }
}
const selfBaseUrl = resolveSelfBaseUrl();

const inventoryDb = openInventoryDb(resolveInventorySqlitePath());
const coreDb = openCoreDb(resolveCoreSqlitePath());
const app = createInventoryApiApp({ inventoryDb, coreDb, version, selfBaseUrl });

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildInventoryManifest(version),
    baseUrl: selfBaseUrl,
  });
}

const server = app.listen(port, () => {
  console.warn(`[inventory-api] Listening on port ${port}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[inventory-api] Shutting down (${signal})`);
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close(() => {
      inventoryDb.raw.close();
      coreDb.raw.close();
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
