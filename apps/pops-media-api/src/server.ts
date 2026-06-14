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
 *
 * Theme 13 PRD-158 adds an opt-in registry handshake via
 * `bootstrapPillar`. When `POPS_REGISTRY_ENABLED=true`, the process
 * builds a hand-rolled media manifest (PRD-155 will generate this
 * later) and registers with the central registry on boot. SIGTERM
 * triggers `pillarHandle.stop()` so the heartbeat clears and the
 * registry sees an explicit deregister.
 */
import { openMediaDb, shelfImpressionsService } from '@pops/media-db';
import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

import { createMediaApiApp } from './app.js';
import { resolveMediaSqlitePath } from './media-sqlite-path.js';

import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

function resolvePort(): number {
  // 3001 is core-api, 3002 is inventory-api, 3003 is media-api.
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3003;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[media-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

function buildMediaManifest(version: string): ManifestPayload {
  return {
    pillar: 'media',
    version,
    contract: {
      package: '@pops/media-contract',
      version,
      tag: `contract-media@v${version}`,
    },
    routes: {
      queries: [
        'media.shelfImpressions.getRecentImpressions',
        'media.shelfImpressions.getShelfFreshness',
      ],
      mutations: ['media.shelfImpressions.recordImpressions', 'media.shelfImpressions.cleanup'],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';

const mediaDb = openMediaDb(resolveMediaSqlitePath());
// PRD-065 retention cleanup: the shelf-impressions service runs once at
// boot per the user-story spec, so the per-pillar container is the right
// owner now that the writer lives here.
shelfImpressionsService.initImpressionsService(mediaDb.db);
const app = createMediaApiApp({ mediaDb, version });

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({ manifest: buildMediaManifest(version) });
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
