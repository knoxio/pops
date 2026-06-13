/**
 * Request handlers for the media pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the
 * shape directly without booting Express. Subsequent PRs add tRPC +
 * domain-specific handlers alongside the existing health probe.
 *
 * Mirrors `apps/pops-core-api/src/handlers.ts` minus the pillar-registry
 * surface (the registry is hosted by core-api only).
 */

import type { OpenedMediaDb } from '@pops/media-db';

export interface MediaApiDeps {
  /** Open handle to the media pillar's SQLite. */
  mediaDb: OpenedMediaDb;
  /** Semver of the build, surfaced on the health response. */
  version: string;
}

export interface HealthResponse {
  ok: true;
  status: 'ok';
  pillar: 'media';
  version: string;
  ts: string;
}

export function makeRequestHandler(deps: MediaApiDeps): {
  health(): HealthResponse;
} {
  return {
    health(): HealthResponse {
      // Touch the DB so a closed handle surfaces as a thrown error
      // (caught by the Express error pipeline -> 500) rather than a
      // bogus 200 OK that hides a broken connection.
      deps.mediaDb.raw.prepare('SELECT 1').get();
      return {
        ok: true,
        status: 'ok',
        pillar: 'media',
        version: deps.version,
        ts: new Date().toISOString(),
      };
    },
  };
}
