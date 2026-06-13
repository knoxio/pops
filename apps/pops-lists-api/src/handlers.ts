/**
 * Request handlers for the lists pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the
 * shape directly without booting Express. Phase 3 PR 1 ships the
 * `/health` + `/pillars` probes; subsequent PRs add the URI dispatcher
 * (`POST /uri/resolve`) and tRPC routers.
 */
import { getPillarRegistry } from './pillars/registry.js';

import type { OpenedListsDb } from '@pops/lists-db';
import type { PillarRegistryEntry } from '@pops/types';

export interface ListsApiDeps {
  /** Open handle to the lists pillar's SQLite. */
  listsDb: OpenedListsDb;
  /** Semver of the build, surfaced on the health response. */
  version: string;
  /**
   * HTTP origin lists-api is reachable at. Surfaced as the synthetic
   * `lists` entry in `GET /pillars` so consumers don't have to
   * special-case the host pillar.
   */
  selfBaseUrl: string;
}

export interface HealthResponse {
  ok: true;
  status: 'ok';
  pillar: 'lists';
  version: string;
  ts: string;
}

export interface PillarsResponse {
  pillars: readonly PillarRegistryEntry[];
}

export function makeRequestHandler(deps: ListsApiDeps): {
  health(): HealthResponse;
  pillars(): PillarsResponse;
} {
  return {
    health(): HealthResponse {
      // Touch the DB so a closed handle surfaces as a thrown error
      // (caught by the Express error pipeline -> 500) rather than a
      // bogus 200 OK that hides a broken connection.
      deps.listsDb.raw.prepare('SELECT 1').get();
      return {
        ok: true,
        status: 'ok',
        pillar: 'lists',
        version: deps.version,
        ts: new Date().toISOString(),
      };
    },
    pillars(): PillarsResponse {
      return { pillars: getPillarRegistry({ selfBaseUrl: deps.selfBaseUrl }) };
    },
  };
}
