import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

/**
 * Entry point for the lists pillar HTTP server.
 *
 * The process opens its OWN `lists.db` connection via `openListsDb`
 * rather than sharing one — each pillar owns its database.
 *
 * When `POPS_REGISTRY_ENABLED=true`, `bootstrapPillar` registers the
 * pillar with the central registry on boot. SIGTERM triggers
 * `pillarHandle.stop()` so the heartbeat clears and the registry sees an
 * explicit deregister.
 */
import { openListsDb } from '../db/index.js';
import { createListsApiApp } from './app.js';
import { resolveListsSqlitePath } from './lists-sqlite-path.js';
import { buildListsManifest } from './manifest.js';
import { parseBareOrigin } from './pillars/env.js';

function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3006;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[lists-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';
// Normalise LISTS_SELF_BASE_URL (or the localhost fallback) through the
// shared bare-origin parser so a misconfigured env crashes boot loudly
// instead of publishing an invalid PillarRegistryEntry.baseUrl. The
// parser's own error is prefixed `POPS_PILLARS:`, which misleads when
// the failing env is LISTS_SELF_BASE_URL — wrap + rethrow with a
// lists-api-scoped message so operators look at the right env var.
function resolveSelfBaseUrl(): string {
  const raw = process.env['LISTS_SELF_BASE_URL'] ?? `http://localhost:${port}`;
  try {
    return parseBareOrigin('LISTS_SELF_BASE_URL', raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[lists-api] LISTS_SELF_BASE_URL ${raw} is invalid — ${message}`, {
      cause: err,
    });
  }
}
const selfBaseUrl = resolveSelfBaseUrl();

const listsDb = openListsDb(resolveListsSqlitePath());
const app = createListsApiApp({ listsDb, version, selfBaseUrl });

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildListsManifest(version),
    baseUrl: selfBaseUrl,
  });
}

const server = app.listen(port, () => {
  console.warn(`[lists-api] Listening on port ${port}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[lists-api] Shutting down (${signal})`);
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close(() => {
      listsDb.raw.close();
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
