/**
 * Top-level request handlers for the media pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the
 * shape directly without booting Express.
 */
import { getPillarRegistry } from './pillars/registry.js';

import type { PillarRegistryEntry } from '@pops/types';

import type { OpenedMediaDb } from '../db/index.js';

export interface MediaApiDeps {
  /** Open handle to the media pillar's SQLite. */
  mediaDb: OpenedMediaDb;
  /** Semver of the build, surfaced on the health response. */
  version: string;
  /**
   * HTTP origin media-api is reachable at. Surfaced as the synthetic
   * `media` entry in `GET /pillars` so consumers don't have to special-case
   * the host pillar.
   */
  selfBaseUrl: string;
}

export interface HealthResponse {
  ok: true;
  status: 'ok';
  pillar: 'media';
  version: string;
  ts: string;
}

export interface PillarsResponse {
  pillars: readonly PillarRegistryEntry[];
}

export function makeRequestHandler(deps: MediaApiDeps): {
  health(): HealthResponse;
  pillars(): PillarsResponse;
} {
  return {
    health(): HealthResponse {
      // Touch the DB so a closed handle surfaces as a thrown error
      // (caught by the Express error pipeline -> 500) rather than a bogus
      // 200 OK that hides a broken connection.
      deps.mediaDb.raw.prepare('SELECT 1').get();
      return {
        ok: true,
        status: 'ok',
        pillar: 'media',
        version: deps.version,
        ts: new Date().toISOString(),
      };
    },
    pillars(): PillarsResponse {
      return { pillars: getPillarRegistry({ selfBaseUrl: deps.selfBaseUrl }) };
    },
  };
}
