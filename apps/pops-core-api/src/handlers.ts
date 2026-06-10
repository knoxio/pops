/**
 * Request handlers for the core pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the
 * shape directly without booting Express. Subsequent PRs add tRPC +
 * `/uri/resolve` + `/pillars` handlers alongside the health probe.
 */
import type { OpenedCoreDb } from '@pops/core-db';

export interface CoreApiDeps {
  /** Open handle to the core pillar's SQLite. */
  coreDb: OpenedCoreDb;
  /** Semver of the build, surfaced on the health response. */
  version: string;
}

export interface HealthResponse {
  ok: true;
  pillar: 'core';
  version: string;
}

export function makeRequestHandler(deps: CoreApiDeps): {
  health(): HealthResponse;
} {
  return {
    health(): HealthResponse {
      // Touch the DB so a closed handle surfaces as a thrown error
      // (caught by the Express error pipeline -> 500) rather than a
      // bogus 200 OK that hides a broken connection.
      deps.coreDb.raw.prepare('SELECT 1').get();
      return { ok: true, pillar: 'core', version: deps.version };
    },
  };
}
