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
import { plexScheduler } from './cron/plex-scheduler.js';
import { rotationScheduler } from './cron/rotation-scheduler.js';
import { buildMediaCapabilityReporter, buildMediaManifest } from './manifest.js';
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

// Periodic Plex sync scheduler (slice 9c). When PLEX_SCHEDULER_ENABLED is
// set, force-start with the PLEX_SCHEDULER_INTERVAL_MS interval; otherwise
// auto-resume from the persisted `plex_scheduler_enabled` flag in
// plex_settings. The controller is a module-level singleton so the REST
// start/stop handlers drive the same timer.
function resolveSchedulerIntervalMs(): number | undefined {
  const raw = process.env['PLEX_SCHEDULER_INTERVAL_MS'];
  if (raw === undefined || raw === '') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

if (process.env['PLEX_SCHEDULER_ENABLED'] === 'true') {
  plexScheduler.start({ db: mediaDb.db, intervalMs: resolveSchedulerIntervalMs() });
} else {
  plexScheduler.resumeIfEnabled(mediaDb.db);
}

// Rotation-cycle scheduler (slice 11b). Mirror of the Plex scheduler:
// MEDIA_ROTATION_SCHEDULER_ENABLED force-starts; otherwise auto-resume from
// the persisted `rotation_enabled` flag. The controller is a module-level
// singleton so the REST toggle/run-now handlers drive the same timer.
if (process.env['MEDIA_ROTATION_SCHEDULER_ENABLED'] === 'true') {
  rotationScheduler.start({ db: mediaDb.db });
} else {
  rotationScheduler.resumeIfEnabled(mediaDb.db);
}

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildMediaManifest(version),
    baseUrl: selfBaseUrl,
    capabilityReporter: buildMediaCapabilityReporter(),
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
  plexScheduler.stop();
  rotationScheduler.stop(mediaDb.db);
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close(() => {
      mediaDb.raw.close();
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
