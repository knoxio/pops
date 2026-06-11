/**
 * Request handlers for the inventory pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the
 * shape directly without booting Express. Subsequent PRs add tRPC +
 * `/uri/resolve` handlers alongside the existing health + pillars probes.
 */
import { getPillarRegistry } from './pillars/registry.js';

import type { OpenedCoreDb } from '@pops/core-db';
import type { OpenedInventoryDb } from '@pops/inventory-db';
import type { PillarRegistryEntry } from '@pops/types';

export interface InventoryApiDeps {
  /** Open handle to the inventory pillar's SQLite. */
  inventoryDb: OpenedInventoryDb;
  /**
   * Optional handle to the shared `core.db`. When present, inventory-api's
   * tRPC context factory uses it to authenticate `X-API-Key` callers
   * against the service-accounts table so machine principals reach
   * inventory endpoints with the same semantics they get from the
   * legacy pops-api router. When absent, only Cloudflare Access (or the
   * dev/tunnel fallbacks) is honoured — used by tests that don't
   * exercise SA auth.
   */
  coreDb?: OpenedCoreDb;
  /** Semver of the build, surfaced on the health response. */
  version: string;
  /**
   * HTTP origin inventory-api is reachable at. Surfaced as the
   * synthetic `inventory` entry in `GET /pillars` so consumers don't
   * have to special-case the host pillar.
   */
  selfBaseUrl: string;
}

export interface HealthResponse {
  ok: true;
  pillar: 'inventory';
  version: string;
}

export interface PillarsResponse {
  pillars: readonly PillarRegistryEntry[];
}

export function makeRequestHandler(deps: InventoryApiDeps): {
  health(): HealthResponse;
  pillars(): PillarsResponse;
} {
  return {
    health(): HealthResponse {
      // Touch the DB so a closed handle surfaces as a thrown error
      // (caught by the Express error pipeline -> 500) rather than a
      // bogus 200 OK that hides a broken connection.
      deps.inventoryDb.raw.prepare('SELECT 1').get();
      return { ok: true, pillar: 'inventory', version: deps.version };
    },
    pillars(): PillarsResponse {
      return { pillars: getPillarRegistry({ selfBaseUrl: deps.selfBaseUrl }) };
    },
  };
}
