/**
 * Request handlers for the cerebrum pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the shape
 * directly without booting Express. Per-domain REST handlers compose
 * alongside the health + pillars probes via `rest/handlers.ts`.
 */
import { getPillarRegistry } from './pillars/registry.js';

import type { PillarRegistryEntry } from '@pops/types';

import type { OpenedCerebrumDb } from '../db/index.js';
import type { TemplateRegistry } from './modules/templates/registry.js';

export interface CerebrumApiDeps {
  /** Open handle to the cerebrum pillar's SQLite (sqlite-vec loaded). */
  cerebrumDb: OpenedCerebrumDb;
  /** In-memory registry of on-disk engram templates. */
  templateRegistry: TemplateRegistry;
  /**
   * Root directory holding the engram Markdown files (the SQLite index is a
   * regenerable cache of it). Resolved from `CEREBRUM_ENGRAMS_DIR` at boot.
   */
  engramRoot: string;
  /** Semver of the build, surfaced on the health response. */
  version: string;
  /**
   * HTTP origin cerebrum-api is reachable at. Surfaced as the synthetic
   * `cerebrum` entry in `GET /pillars` so consumers don't have to
   * special-case the host pillar.
   */
  selfBaseUrl: string;
}

export interface HealthResponse {
  ok: true;
  status: 'ok';
  pillar: 'cerebrum';
  version: string;
  ts: string;
}

export interface PillarsResponse {
  pillars: readonly PillarRegistryEntry[];
}

export function makeRequestHandler(deps: CerebrumApiDeps): {
  health(): HealthResponse;
  pillars(): PillarsResponse;
} {
  return {
    health(): HealthResponse {
      // Touch the DB so a closed handle surfaces as a thrown error (caught by
      // the Express error pipeline -> 500) rather than a bogus 200 OK that
      // hides a broken connection.
      deps.cerebrumDb.raw.prepare('SELECT 1').get();
      return {
        ok: true,
        status: 'ok',
        pillar: 'cerebrum',
        version: deps.version,
        ts: new Date().toISOString(),
      };
    },
    pillars(): PillarsResponse {
      return { pillars: getPillarRegistry({ selfBaseUrl: deps.selfBaseUrl }) };
    },
  };
}
