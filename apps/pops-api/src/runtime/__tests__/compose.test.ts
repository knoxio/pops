/**
 * PRD-242 US-02 — runtime `mergeRouters` composition + registry-event
 * recomposition.
 *
 * Coverage:
 *   1. At boot, the runtime appRouter exposes every top-level id in
 *      `KNOWN_ROUTERS_GENERATED` (the codegen catalogue from PRD-242 US-01).
 *   2. Registering a synthetic external pillar recomposes appRouter so the
 *      pillar's `${id}.callDynamic` procedure becomes reachable.
 *   3. Deregistering removes the pillar from the next composition.
 *   4. Registering an id that collides with the codegen catalogue throws
 *      `PillarIdCollisionError` — external pillars cannot shadow in-repo
 *      pillars (PRD-228 reserved-id rule).
 *   5. `mergeRouters` preserves the in-repo procedure surface: every
 *      procedure key exposed by the static base appears verbatim on the
 *      merged router.
 */
import { describe, expect, it } from 'vitest';

import { KNOWN_ROUTERS_GENERATED } from '../../generated/known-routers.js';
import { appRouter as staticAppRouter } from '../../router.js';
import { deferredExternalForwarder } from '../external-router.js';
import {
  composeAppRouter,
  createExternalsRegistry,
  installAppRouterHolder,
  PillarIdCollisionError,
} from '../index.js';

interface RouterWithDef {
  readonly _def: { readonly procedures: Readonly<Record<string, unknown>> };
}

const RESERVED_IDS = new Set(Object.keys(KNOWN_ROUTERS_GENERATED));

function topLevelIds(rtr: RouterWithDef): Set<string> {
  return new Set(Object.keys(rtr._def.procedures).map((path) => path.split('.')[0] ?? ''));
}

function procedurePaths(rtr: RouterWithDef): readonly string[] {
  return Object.keys(rtr._def.procedures).toSorted();
}

describe('PRD-242 US-02 runtime appRouter composition', () => {
  it('boot exposes every top-level id from KNOWN_ROUTERS_GENERATED', () => {
    const registry = createExternalsRegistry(RESERVED_IDS);
    const holder = installAppRouterHolder({
      registry,
      forward: deferredExternalForwarder,
      debounceMs: 0,
      staticBase: staticAppRouter,
    });

    try {
      const tops = topLevelIds(holder.current);
      for (const id of Object.keys(KNOWN_ROUTERS_GENERATED)) {
        expect(tops.has(id), `expected runtime appRouter to expose '${id}'`).toBe(true);
      }
      // No external pillars at boot — runtime tops match in-repo tops.
      expect(tops).toEqual(topLevelIds(staticAppRouter));
    } finally {
      holder.stop();
    }
  });

  it('registering an external pillar adds it to the next composition', () => {
    const registry = createExternalsRegistry(RESERVED_IDS);
    const holder = installAppRouterHolder({
      registry,
      forward: deferredExternalForwarder,
      debounceMs: 0,
      staticBase: staticAppRouter,
    });

    try {
      expect(topLevelIds(holder.current).has('recipes')).toBe(false);

      registry.register({ pillarId: 'recipes', baseUrl: 'http://recipes-api:4010' });

      const tops = topLevelIds(holder.current);
      expect(tops.has('recipes')).toBe(true);
      const paths = procedurePaths(holder.current);
      expect(paths).toContain('recipes.callDynamic');
    } finally {
      holder.stop();
    }
  });

  it('deregistering an external pillar removes it from the next composition', () => {
    const registry = createExternalsRegistry(RESERVED_IDS);
    const holder = installAppRouterHolder({
      registry,
      forward: deferredExternalForwarder,
      debounceMs: 0,
      staticBase: staticAppRouter,
    });

    try {
      registry.register({ pillarId: 'recipes', baseUrl: 'http://recipes-api:4010' });
      expect(topLevelIds(holder.current).has('recipes')).toBe(true);

      const removed = registry.deregister('recipes');
      expect(removed).toBe(true);
      expect(topLevelIds(holder.current).has('recipes')).toBe(false);

      // Idempotent: a second deregister returns false and does not throw.
      expect(registry.deregister('recipes')).toBe(false);
    } finally {
      holder.stop();
    }
  });

  it('external pillar id collisions with the codegen catalogue are rejected', () => {
    const registry = createExternalsRegistry(RESERVED_IDS);

    for (const id of Object.keys(KNOWN_ROUTERS_GENERATED)) {
      expect(() => registry.register({ pillarId: id, baseUrl: 'http://x' })).toThrowError(
        PillarIdCollisionError
      );
    }
  });

  it('mergeRouters preserves every in-repo procedure surface verbatim', () => {
    const registry = createExternalsRegistry(RESERVED_IDS);
    registry.register({ pillarId: 'recipes', baseUrl: 'http://recipes-api:4010' });

    const merged = composeAppRouter({
      registry,
      forward: deferredExternalForwarder,
      staticBase: staticAppRouter,
    });

    const baseProcedures = new Set(procedurePaths(staticAppRouter));
    const mergedProcedures = new Set(procedurePaths(merged));

    for (const path of baseProcedures) {
      expect(mergedProcedures.has(path), `procedure '${path}' missing after merge`).toBe(true);
    }

    // The merge adds — does not subtract.
    expect(mergedProcedures.size).toBeGreaterThanOrEqual(baseProcedures.size + 1);
    expect(mergedProcedures.has('recipes.callDynamic')).toBe(true);
  });
});
