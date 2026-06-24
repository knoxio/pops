/**
 * Request handlers for the core pillar container.
 *
 * Logic lives here (not inline in `app.ts`) so tests can call into the
 * shape directly without booting Express. Covers the health + pillars
 * registry probes plus the cross-pillar `/uri/resolve` dispatcher and the
 * `/pillars/health` fan-out (ADR-026 P2/P3).
 */
import { readInstalledModules } from './env-modules.js';
import { getUriRegistry } from './modules/uri/registry.js';
import { dispatchUri, type DispatchUriOptions } from './pillars/dispatcher.js';
import { type PillarHealthMap, probeAllPillars } from './pillars/health-probe.js';
import { getPillarRegistry, getRemotePillarEntry } from './pillars/registry.js';

import type { PillarRegistryEntry, UriResolverResult } from '@pops/types';

import type { CoreDb, OpenedCoreDb } from '../db/index.js';

export interface CoreApiDeps {
  /** Open handle to the core pillar's SQLite. */
  coreDb: OpenedCoreDb;
  /** Semver of the build, surfaced on the health response. */
  version: string;
  /**
   * HTTP origin the registry pillar is reachable at. Surfaced as the
   * synthetic `registry` entry in `GET /pillars` so consumers don't have
   * to special-case the host pillar.
   */
  selfBaseUrl: string;
}

export interface HealthResponse {
  ok: true;
  status: 'ok';
  pillar: 'registry';
  version: string;
  ts: string;
}

export interface PillarsResponse {
  pillars: readonly PillarRegistryEntry[];
}

export interface PillarsHealthResponse {
  health: PillarHealthMap;
}

/**
 * Build the dispatcher's `DispatchUriOptions` from current process state.
 *
 * Factored out so tests can call `dispatchUri` directly with stub registries
 * while the HTTP route uses the live in-process module registry + install
 * set.
 *
 * `lookupPillar` is registry-first: it routes the remote leg off the live DB
 * registry and falls back to the `POPS_PILLARS` seed (`getRemotePillarEntry`).
 */
function buildResolveOptions(db: CoreDb): DispatchUriOptions {
  const installed = readInstalledModules();
  const installedSet = new Set<string>(['registry', ...installed.apps, ...installed.overlays]);
  return {
    registry: getUriRegistry(),
    isInstalled: (moduleId: string) => installedSet.has(moduleId),
    lookupPillar: (id: string) => getRemotePillarEntry(db, id),
  };
}

export function makeRequestHandler(deps: CoreApiDeps): {
  health(): HealthResponse;
  pillars(): PillarsResponse;
  resolveUri(uri: string): Promise<UriResolverResult>;
  pillarsHealth(): Promise<PillarsHealthResponse>;
} {
  function listPillars(): readonly PillarRegistryEntry[] {
    return getPillarRegistry({ db: deps.coreDb.db, selfBaseUrl: deps.selfBaseUrl });
  }

  return {
    health(): HealthResponse {
      // Touch the DB so a closed handle surfaces as a thrown error
      // (caught by the Express error pipeline -> 500) rather than a
      // bogus 200 OK that hides a broken connection.
      deps.coreDb.raw.prepare('SELECT 1').get();
      return {
        ok: true,
        status: 'ok',
        pillar: 'registry',
        version: deps.version,
        ts: new Date().toISOString(),
      };
    },
    pillars(): PillarsResponse {
      return { pillars: listPillars() };
    },
    resolveUri(uri: string): Promise<UriResolverResult> {
      return dispatchUri(uri, buildResolveOptions(deps.coreDb.db));
    },
    async pillarsHealth(): Promise<PillarsHealthResponse> {
      return { health: await probeAllPillars(listPillars()) };
    },
  };
}
