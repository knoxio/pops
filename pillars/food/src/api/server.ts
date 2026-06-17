import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

/**
 * Entry point for the food pillar HTTP server.
 *
 * Phase 3 PR 1 of the food pillar migration boots the process with
 * the minimal `/health` + `/pillars` surface so the new container can
 * be wired into docker-compose + Watchtower without depending on the
 * (still-unfinished) tRPC + URI-dispatcher migration.
 *
 * The process opens its OWN `food.db` connection via `openFoodDb`
 * rather than reaching back into pops-api's singleton — that's the
 * whole point of phase 3.
 *
 * Theme 13 PRD-158 adds an opt-in registry handshake via
 * `bootstrapPillar`. When `POPS_REGISTRY_ENABLED=true`, the process
 * builds a hand-rolled food manifest (PRD-155 will generate this
 * later) and registers with the central registry on boot. SIGTERM
 * triggers `pillarHandle.stop()` so the heartbeat clears and the
 * registry sees an explicit deregister.
 *
 * The runtime tRPC surface is still pending, so `routes.queries`
 * and `routes.mutations` are empty for now — bootstrap registers
 * the pillar's identity, health probe, and contract pin.
 */
import { openFoodDb } from '../db/index.js';
import { createFoodApiApp } from './app.js';
import { resolveFoodSqlitePath } from './food-sqlite-path.js';
import { buildFoodManifest } from './manifest.js';
import { parseBareOrigin } from './pillars/env.js';
import { closeFoodIngestQueue } from './queue.js';

function resolvePort(): number {
  // 3001 is core-api, 3002 is inventory-api, 3003 is media-api,
  // 3004 is finance-api, 3005 is food-api, 3007 is cerebrum-api.
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3005;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[food-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';
// Normalise FOOD_SELF_BASE_URL (or the localhost fallback) through
// the shared bare-origin parser so a misconfigured env crashes boot
// loudly instead of publishing an invalid PillarRegistryEntry.baseUrl
// that breaks downstream consumers appending `/uri/resolve`, `/health`,
// etc. parseBareOrigin throws a PillarsEnvParseError prefixed with
// `POPS_PILLARS:` — fine when the parser is consulted from
// parsePillarsEnv, but misleading when the failing env is actually
// FOOD_SELF_BASE_URL. Wrap + rethrow with a food-api-scoped message
// so operators look at the right env var.
function resolveSelfBaseUrl(): string {
  const raw = process.env['FOOD_SELF_BASE_URL'] ?? `http://localhost:${port}`;
  try {
    return parseBareOrigin('FOOD_SELF_BASE_URL', raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[food-api] FOOD_SELF_BASE_URL ${raw} is invalid — ${message}`, {
      cause: err,
    });
  }
}
const selfBaseUrl = resolveSelfBaseUrl();

const foodDb = openFoodDb(resolveFoodSqlitePath());
const app = createFoodApiApp({ foodDb, version, selfBaseUrl });

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildFoodManifest(version),
    baseUrl: selfBaseUrl,
  });
}

const server = app.listen(port, () => {
  console.warn(`[food-api] Listening on port ${port}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[food-api] Shutting down (${signal})`);
  void (pillarHandle?.stop() ?? Promise.resolve())
    .finally(() => closeFoodIngestQueue())
    .finally(() => {
      server.close(() => {
        foodDb.raw.close();
      });
    });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
