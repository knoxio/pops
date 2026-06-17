/**
 * Entry point for the cerebrum pillar HTTP server.
 *
 * Boots the process with the `/health` + `/pillars` probes and the migrated
 * REST surface. The process opens its OWN `cerebrum.db` connection via
 * `openCerebrumDb` (loading sqlite-vec) rather than reaching back into
 * pops-api's singleton.
 *
 * When `POPS_REGISTRY_ENABLED=true`, the process registers a hand-rolled
 * manifest with the central registry on boot; SIGTERM triggers
 * `pillarHandle.stop()` so the heartbeat clears and the registry sees an
 * explicit deregister.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

import { openCerebrumDb } from '../db/index.js';
import { createCerebrumApiApp } from './app.js';
import { resolveCerebrumSqlitePath } from './cerebrum-sqlite-path.js';
import { buildCerebrumManifest } from './manifest.js';
import { resolveEngramRoot } from './modules/engrams/instance.js';
import { TemplateRegistry } from './modules/templates/registry.js';
import { parseBareOrigin } from './pillars/env.js';

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

function resolveSelfBaseUrl(): string {
  const raw = process.env['CEREBRUM_SELF_BASE_URL'] ?? `http://localhost:${port}`;
  try {
    return parseBareOrigin('CEREBRUM_SELF_BASE_URL', raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[cerebrum-api] CEREBRUM_SELF_BASE_URL ${raw} is invalid — ${message}`, {
      cause: err,
    });
  }
}
const selfBaseUrl = resolveSelfBaseUrl();

function resolveTemplatesDir(): string {
  const envDir = process.env['CEREBRUM_TEMPLATES_DIR'];
  if (envDir) return envDir;
  return resolve(dirname(fileURLToPath(import.meta.url)), 'modules', 'templates', 'defaults');
}

const cerebrumDb = openCerebrumDb(resolveCerebrumSqlitePath());
const templateRegistry = new TemplateRegistry(resolveTemplatesDir());
const engramRoot = resolveEngramRoot();
const app = createCerebrumApiApp({
  cerebrumDb,
  templateRegistry,
  engramRoot,
  version,
  selfBaseUrl,
});

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildCerebrumManifest(version),
    baseUrl: selfBaseUrl,
  });
}

const server = app.listen(port, () => {
  console.warn(`[cerebrum-api] Listening on port ${port}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[cerebrum-api] Shutting down (${signal})`);
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close(() => {
      cerebrumDb.raw.close();
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
