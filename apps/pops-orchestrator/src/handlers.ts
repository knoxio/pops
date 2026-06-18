/**
 * Top-level request handlers for the orchestrator container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the
 * shape directly without booting Express. The orchestrator owns no domain
 * DB, so `health` is a pure liveness shape rather than a DB round-trip
 * (contrast the pillars, which touch SQLite to surface a dead handle).
 */
import { getPillarRegistry, ORCHESTRATOR_PILLAR_ID } from './pillars/registry.js';

import type { PillarRegistryEntry } from '@pops/types';

export interface OrchestratorDeps {
  /** Semver of the build, surfaced on the health response. */
  version: string;
  /**
   * HTTP origin the orchestrator is reachable at. Surfaced as the
   * synthetic `orchestrator` entry in `GET /pillars` so consumers don't
   * have to special-case the federating service.
   */
  selfBaseUrl: string;
}

export interface HealthResponse {
  ok: true;
  status: 'ok';
  service: typeof ORCHESTRATOR_PILLAR_ID;
  version: string;
  ts: string;
}

export interface PillarsResponse {
  pillars: readonly PillarRegistryEntry[];
}

export function makeRequestHandler(deps: OrchestratorDeps): {
  health(): HealthResponse;
  pillars(): PillarsResponse;
} {
  return {
    health(): HealthResponse {
      return {
        ok: true,
        status: 'ok',
        service: ORCHESTRATOR_PILLAR_ID,
        version: deps.version,
        ts: new Date().toISOString(),
      };
    },
    pillars(): PillarsResponse {
      return { pillars: getPillarRegistry({ selfBaseUrl: deps.selfBaseUrl }) };
    },
  };
}
