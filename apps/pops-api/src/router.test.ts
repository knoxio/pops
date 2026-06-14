/**
 * PRD-101 US-03: root tRPC router composed from the build-time module
 * registry via `installedManifests()`.
 *
 * These tests exercise the runtime composition layer with synthetic
 * install sets injected via `__setInstalledManifestsOverride`. The
 * generated `appRouter` is a module-level constant initialised once at
 * import time using the build-time `MODULES` array — we can't re-build it
 * per test, so we assert against:
 *   - the static shape (what `MODULES` produced at import time), and
 *   - the runtime `composeInstalledRouters`-equivalent path via the
 *     `installedManifests()` override the same code reads from.
 *
 * Coverage:
 *   - Default install (everything in `MODULES`) produces every backend
 *     router under its manifest id.
 *   - With a finance-only override, the aggregator returns only finance +
 *     core (mirroring how `appRouter` composition would behave on a build
 *     of pops-api with `POPS_APPS=finance`).
 *   - The frontend-only `ai` module is silently skipped — its manifest
 *     has no `backend` slot so it never appears in the root router.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { manifest as cerebrumEgoManifest } from './modules/cerebrum/ego/index.js';
import { manifest as cerebrumManifest } from './modules/cerebrum/index.js';
import { manifest as coreManifest } from './modules/core/index.js';
import { manifest as financeManifest } from './modules/finance/index.js';
import { manifest as foodManifest } from './modules/food/index.js';
import {
  __resetInstalledManifestsOverride,
  __setInstalledManifestsOverride,
  installedManifests,
} from './modules/installed-modules.js';
import { manifest as inventoryManifest } from './modules/inventory/index.js';
import { manifest as listsManifest } from './modules/lists/index.js';
import { manifest as mediaManifest } from './modules/media/index.js';
import { appRouter } from './router.js';

import type { ModuleManifest } from '@pops/types';

/**
 * Procedure paths in the appRouter, sorted for stable comparison. Module ids
 * appear as the first dot-separated segment of every key.
 */
function procedurePaths(rtr: { _def: { procedures: Record<string, unknown> } }): string[] {
  return Object.keys(rtr._def.procedures).toSorted();
}

function topLevelIds(rtr: { _def: { procedures: Record<string, unknown> } }): Set<string> {
  return new Set(procedurePaths(rtr).map((k) => k.split('.')[0] ?? ''));
}

function routerKeys(): string[] {
  return procedurePaths(appRouter);
}

describe('PRD-101 US-03 root router composition', () => {
  afterEach(() => {
    __resetInstalledManifestsOverride();
  });

  it('mounts every installed backend router under its manifest id', () => {
    // The build-time registry committed to this repo installs every known
    // module (POPS_APPS unset at registry:build time). The runtime router
    // must therefore expose top-level entries for every backend manifest.
    const expectedTops = new Set([
      coreManifest.id,
      financeManifest.id,
      mediaManifest.id,
      inventoryManifest.id,
      cerebrumManifest.id,
      cerebrumEgoManifest.id,
      foodManifest.id,
      // PRD-140 fills `listsRouter` with the lists CRUD procedures, so the
      // `lists` top-level id appears under `appRouter` now.
      listsManifest.id,
    ]);
    const actualTops = new Set(routerKeys().map((k) => k.split('.')[0]));
    for (const id of expectedTops) {
      expect(actualTops.has(id), `expected top-level router '${id}'`).toBe(true);
    }
  });

  it('does not mount frontend-only manifests (no backend.router)', () => {
    // `ai` is a frontend-only module on the API side — there is no
    // `manifest.backend.router` for it, so the root router never picks it
    // up. (Even if the registry includes the id, the API has no live
    // manifest to bind to.)
    const tops = new Set(routerKeys().map((k) => k.split('.')[0]));
    expect(tops.has('ai')).toBe(false);
  });

  it('finance-only override returns finance + core, nothing else', () => {
    // Composition reads from `installedManifests()`; with the override in
    // place the aggregator returns exactly the manifests we list. Core
    // is included unconditionally — the production aggregator prepends
    // it before joining the registry, and tests assert the same contract.
    const overrides: ModuleManifest[] = [coreManifest, financeManifest];
    __setInstalledManifestsOverride(overrides);

    const ids = installedManifests().map((m) => m.id);
    expect(ids).toEqual(['core', 'finance']);

    // Sanity: every override carries a backend router that the root
    // composer would mount.
    for (const m of installedManifests()) {
      expect(m.backend?.router, `manifest '${m.id}' must declare backend.router`).toBeDefined();
    }
  });
});

/**
 * The shape of the root tRPC router is the install-set Pick over
 * `KNOWN_ROUTERS_GENERATED`. These compile-time assertions guard the
 * contract that makes US-03 load-bearing: if a future change accidentally
 * widens the
 * inferred AppRouter type back to a generic `Router<any>`-style shape,
 * the build fails here.
 */
describe('PRD-101 US-03 AppRouter type narrowing (compile-time)', () => {
  // Setup an empty override so test runs don't depend on the build-time
  // generated.ts content; we just assert the type-level properties below.
  beforeEach(() => {
    __setInstalledManifestsOverride([coreManifest]);
  });

  afterEach(() => {
    __resetInstalledManifestsOverride();
  });

  it('declares procedures keyed by installed module id', () => {
    // tRPC stores procedure paths joined with dots; first segment is the
    // top-level router name. Every key MUST start with one of the
    // known module ids in the install set.
    const allowed = new Set([
      coreManifest.id,
      financeManifest.id,
      foodManifest.id,
      mediaManifest.id,
      inventoryManifest.id,
      cerebrumManifest.id,
      cerebrumEgoManifest.id,
      listsManifest.id,
    ]);
    for (const path of routerKeys()) {
      const top = path.split('.')[0] ?? '';
      expect(allowed.has(top), `unexpected top-level router '${top}'`).toBe(true);
    }
  });
});

/**
 * A reduced install set must produce a `composeInstalledRouters()` result
 * with strictly fewer top-level routers. The default `appRouter` import is
 * a module-level constant initialised once against the committed build-time
 * `MODULES`; we can't rebuild it. To genuinely exercise the runtime
 * composition path against a synthetic install set we mock
 * `./modules/installed-modules.js` BEFORE importing `./router.js` so the
 * top-level `composeInstalledRouters()` call runs against the override.
 */
describe('PRD-101 US-03 reduced-install appRouter composition', () => {
  afterEach(() => {
    vi.doUnmock('./modules/installed-modules.js');
    vi.resetModules();
  });

  it('finance-only install set produces an appRouter without media/inventory/cerebrum/ego', async () => {
    vi.resetModules();
    vi.doMock('./modules/installed-modules.js', async () => {
      // Re-export everything from the real module, then override
      // `installedManifests` to return the synthetic finance-only set so
      // `composeInstalledRouters()` sees it during the top-level evaluation
      // of the freshly-imported router module.
      const actual = await vi.importActual<typeof import('./modules/installed-modules.js')>(
        './modules/installed-modules.js'
      );
      return {
        ...actual,
        installedManifests: (): readonly ModuleManifest[] => [coreManifest, financeManifest],
      };
    });

    const fresh = await import('./router.js');
    const tops = topLevelIds(fresh.appRouter);

    expect(tops.has(coreManifest.id)).toBe(true);
    expect(tops.has(financeManifest.id)).toBe(true);
    expect(tops.has(mediaManifest.id)).toBe(false);
    expect(tops.has(inventoryManifest.id)).toBe(false);
    expect(tops.has(cerebrumManifest.id)).toBe(false);
    expect(tops.has(cerebrumEgoManifest.id)).toBe(false);
  });

  it('AppRouter type narrows to nested routers for installed module ids only', async () => {
    // Type-level assertion: if a future change widens the inferred
    // `AppRouter` back to a generic `Router<any>` shape (e.g. by dropping
    // the `Pick<KnownRouters, InstalledRouterId>` narrowing), the
    // `HasNestedRecord` aliases below resolve to `false` and the
    // const-true bindings stop compiling.
    //
    // tRPC v11 `BuiltRouter<TRoot, TRecord> = Router<TRoot, TRecord> & TRecord`
    // — nested routers are intersected into the type by their id with
    // their decorated procedure-record value, not as a sub-`Router`. We
    // detect their presence by checking that `AppRouter[K]` is a known
    // key (not `never`).
    const fresh = await import('./router.js');
    type AppRouter = typeof fresh.appRouter;

    type HasNestedRecord<K extends string> = K extends keyof AppRouter ? true : false;

    // Core is always mounted (PRD-100). Finance is in the committed
    // build-time registry. Both must surface as nested router records.
    const _core: HasNestedRecord<'core'> = true;
    const _finance: HasNestedRecord<'finance'> = true;
    // Reference the bindings so the compiler doesn't flag them as unused.
    expect(_core && _finance).toBe(true);

    // Runtime cross-check: the procedure path table carries entries for
    // every mounted top-level router.
    const tops = topLevelIds(fresh.appRouter);
    expect(tops.has(coreManifest.id)).toBe(true);
    expect(tops.has(financeManifest.id)).toBe(true);
  });
});
