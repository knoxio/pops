import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

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
 *
 * Theme 13 PRD-158 adds an opt-in registry handshake via
 * `bootstrapPillar`. When `POPS_REGISTRY_ENABLED=true`, the process
 * builds a hand-rolled core manifest (PRD-155 will generate this
 * later) and registers with its OWN registry on boot — same loop the
 * other pillars use, just pointed at localhost. SIGTERM triggers
 * `pillarHandle.stop()` so the heartbeat clears and the registry sees
 * an explicit deregister before the HTTP server shuts down.
 */
import { coreKeyDefaults } from '../contract/settings/key-defaults.js';
import { openCoreDb } from '../db/index.js';
import { createCoreApiApp } from './app.js';
import { buildCoreManifest } from './core-manifest.js';
import { resolveCoreSqlitePath } from './core-sqlite-path.js';
import { assertFeatureKeysAreCoreOwned } from './modules/features/key-ownership.js';
import { reconcileRegistryOnBoot } from './modules/registry/boot.js';
import { startEvictionTicker } from './modules/registry/eviction-ticker.js';
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

// settings-federation S1 (R10): fail boot loudly if a system-scoped feature
// names a setting key core does not own — otherwise the toggle would write a
// key the owning pillar never reads once settings federate.
assertFeatureKeysAreCoreOwned(buildCoreManifest(version).features ?? [], coreKeyDefaults);

/**
 * Live status of core's `redis` capability. The core pillar container ships
 * no Redis/BullMQ client, so there is nothing to probe and the honest answer
 * is `false`: the `core.redis` capability feature resolves to
 * `unavailable`/degraded rather than fabricating readiness against a
 * connection that does not exist. Replace this with a real readiness check
 * when core gains a Redis client.
 */
function isCoreRedisReady(): boolean {
  return false;
}

const app = createCoreApiApp({ coreDb, version, selfBaseUrl });

const server = app.listen(port, () => {
  console.warn(`[core-api] Listening on port ${port}`);
});

const stopHeartbeatTicker = startHeartbeatTicker(coreDb.db);
const stopEvictionTicker = startEvictionTicker(coreDb.db);

// The bootstrap handshake registers core with its own registry once the
// HTTP server is accepting traffic. Done after `app.listen` because the
// SDK transport posts the register/heartbeat handshake back to this very
// process (the registry lives here) — registering before listen would race
// the HTTP server up.
let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildCoreManifest(version),
    baseUrl: selfBaseUrl,
    capabilityReporter: () => ({ redis: isCoreRedisReady() }),
  });
}

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[core-api] Shutting down (${signal})`);
  stopHeartbeatTicker();
  stopEvictionTicker();
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close(() => {
      coreDb.raw.close();
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
