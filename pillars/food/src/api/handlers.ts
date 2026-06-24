/**
 * Request handlers for the food pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the
 * shape directly without booting Express.
 */
import { getPillarRegistry } from './pillars/registry.js';

import type { PillarRegistryEntry } from '@pops/types';

import type { OpenedFoodDb } from '../db/index.js';
import type { ListsClient } from './modules/recipes/send-to-list/lists-client.js';

export interface FoodApiDeps {
  /** Open handle to the food pillar's SQLite. */
  foodDb: OpenedFoodDb;
  /** Semver of the build, surfaced on the health response. */
  version: string;
  /**
   * HTTP origin food-api is reachable at. Surfaced as the synthetic
   * `food` entry in `GET /pillars` so consumers don't have to
   * special-case the host pillar.
   */
  selfBaseUrl: string;
  /**
   * Cross-pillar lists client used by send-to-list. Optional — production
   * resolves the real HTTP client lazily from `POPS_PILLARS`; tests inject
   * a stub so the flow runs without a live lists-api.
   */
  listsClient?: ListsClient;
}

export interface HealthResponse {
  ok: true;
  status: 'ok';
  pillar: 'food';
  version: string;
  ts: string;
}

export interface PillarsResponse {
  pillars: readonly PillarRegistryEntry[];
}

export function makeRequestHandler(deps: FoodApiDeps): {
  health(): HealthResponse;
  pillars(): PillarsResponse;
} {
  return {
    health(): HealthResponse {
      // Touch the DB so a closed handle surfaces as a thrown error
      // (caught by the Express error pipeline -> 500) rather than a
      // bogus 200 OK that hides a broken connection.
      deps.foodDb.raw.prepare('SELECT 1').get();
      return {
        ok: true,
        status: 'ok',
        pillar: 'food',
        version: deps.version,
        ts: new Date().toISOString(),
      };
    },
    pillars(): PillarsResponse {
      return { pillars: getPillarRegistry({ selfBaseUrl: deps.selfBaseUrl }) };
    },
  };
}
