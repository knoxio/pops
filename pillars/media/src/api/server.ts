/**
 * Entry point for the media pillar HTTP server.
 *
 * Boots the process with the `/health` + `/pillars` probes and the REST
 * surface generated from `src/contract/rest.ts`. The process opens its OWN
 * `media.db` connection via `openMediaDb` rather than reaching back into
 * pops-api's singleton.
 *
 * When `POPS_REGISTRY_ENABLED=true`, the process registers a media manifest
 * with the central registry on boot via `bootstrapPillar`. SIGTERM triggers
 * `pillarHandle.stop()` so the heartbeat clears and the registry sees an
 * explicit deregister.
 */
import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

import { openMediaDb } from '../db/index.js';
import { createMediaApiApp } from './app.js';
import { buildMediaManifest } from './manifest.js';
import { resolveMediaSqlitePath } from './media-sqlite-path.js';
import { parseBareOrigin } from './pillars/env.js';

function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3003;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[media-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';

// Normalise MEDIA_SELF_BASE_URL (or the localhost fallback) through the
// shared bare-origin parser so a misconfigured env crashes boot loudly
// instead of publishing an invalid PillarRegistryEntry.baseUrl.
function resolveSelfBaseUrl(): string {
  const raw = process.env['MEDIA_SELF_BASE_URL'] ?? `http://localhost:${port}`;
  try {
    return parseBareOrigin('MEDIA_SELF_BASE_URL', raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[media-api] MEDIA_SELF_BASE_URL ${raw} is invalid — ${message}`, {
      cause: err,
    });
  }
}
const selfBaseUrl = resolveSelfBaseUrl();

const mediaDb = openMediaDb(resolveMediaSqlitePath());
const app = createMediaApiApp({ mediaDb, version, selfBaseUrl });

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildMediaManifest(version),
    baseUrl: selfBaseUrl,
  });
}

const server = app.listen(port, () => {
  console.warn(`[media-api] Listening on port ${port}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[media-api] Shutting down (${signal})`);
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close(() => {
      mediaDb.raw.close();
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
