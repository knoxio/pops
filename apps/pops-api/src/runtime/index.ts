/**
 * Runtime composition barrel (PRD-242 US-02).
 *
 * Owns the singleton externals registry + app-router holder for the live
 * orchestrator process. `app.ts` reaches in for `getRuntimeAppRouter()` when
 * building the tRPC express middleware so external pillars registered after
 * boot become reachable without a restart.
 *
 * The reserved-id set is derived from the codegen catalogue: any external
 * pillar attempting to register under a known in-repo id is rejected with
 * `PillarIdCollisionError` (PRD-228 reserved-id rule).
 *
 * Tests construct their own registries + holders through the named
 * `createExternalsRegistry` / `installAppRouterHolder` exports.
 */
import { KNOWN_ROUTERS_GENERATED } from '../generated/known-routers.js';
import { installAppRouterHolder, type AppRouterHolder } from './compose.js';
import { createExternalsRegistry, type ExternalsRegistry } from './externals-registry.js';

import type { AnyRouter } from '@trpc/server';

const RESERVED_IDS: ReadonlySet<string> = new Set(Object.keys(KNOWN_ROUTERS_GENERATED));

let singleton: { registry: ExternalsRegistry; holder: AppRouterHolder } | null = null;

function bootstrap(): { registry: ExternalsRegistry; holder: AppRouterHolder } {
  const registry = createExternalsRegistry(RESERVED_IDS);
  const holder = installAppRouterHolder({ registry });
  return { registry, holder };
}

function getSingleton(): { registry: ExternalsRegistry; holder: AppRouterHolder } {
  singleton ??= bootstrap();
  return singleton;
}

/**
 * The orchestrator's runtime tRPC router. The express middleware reads this
 * accessor per request, so an external-pillar register / deregister observed
 * by the registry surfaces on the next request after recomposition settles.
 */
export function getRuntimeAppRouter(): AnyRouter {
  return getSingleton().holder.current;
}

/** The orchestrator's externals registry. PRD-228 HTTP handlers call into this. */
export function getExternalsRegistry(): ExternalsRegistry {
  return getSingleton().registry;
}

/**
 * Test-only reset: drops the singleton and stops the active holder's event
 * subscription. The next call to `getRuntimeAppRouter` rebuilds from scratch.
 */
export function __resetRuntimeAppRouter(): void {
  if (singleton !== null) {
    singleton.holder.stop();
    singleton = null;
  }
}

export { createExternalsRegistry } from './externals-registry.js';
export { installAppRouterHolder, composeAppRouter } from './compose.js';
export type { ExternalsRegistry, ExternalPillarEntry } from './externals-registry.js';
export type { AppRouterHolder } from './compose.js';
export { PillarIdCollisionError } from './externals-registry.js';
