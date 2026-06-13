/**
 * Request handlers for the core pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the
 * shape directly without booting Express. Subsequent PRs add tRPC +
 * `/uri/resolve` handlers alongside the existing health + pillars probes.
 */
import { getPillarRegistry } from './pillars/registry.js';

import type { OpenedCoreDb } from '@pops/core-db';
import type { PillarRegistryEntry } from '@pops/types';

export interface CoreApiDeps {
  /** Open handle to the core pillar's SQLite. */
  coreDb: OpenedCoreDb;
  /** Semver of the build, surfaced on the health response. */
  version: string;
  /**
   * HTTP origin core-api is reachable at. Surfaced as the synthetic
   * `core` entry in `GET /pillars` so consumers don't have to special-
   * case the host pillar.
   */
  selfBaseUrl: string;
}

export interface HealthResponse {
  ok: true;
  status: 'ok';
  pillar: 'core';
  version: string;
  ts: string;
}

export interface PillarsResponse {
  pillars: readonly PillarRegistryEntry[];
}

export function makeRequestHandler(deps: CoreApiDeps): {
  health(): HealthResponse;
  pillars(): PillarsResponse;
} {
  return {
    health(): HealthResponse {
      // Touch the DB so a closed handle surfaces as a thrown error
      // (caught by the Express error pipeline -> 500) rather than a
      // bogus 200 OK that hides a broken connection.
      deps.coreDb.raw.prepare('SELECT 1').get();
      return {
        ok: true,
        status: 'ok',
        pillar: 'core',
        version: deps.version,
        ts: new Date().toISOString(),
      };
    },
    pillars(): PillarsResponse {
      return { pillars: getPillarRegistry({ selfBaseUrl: deps.selfBaseUrl }) };
    },
  };
}
