/**
 * Main tRPC app router — composed from the build-time module registry
 * (`@pops/module-registry`) via the `installedManifests()` aggregator.
 *
 * PRD-101 US-03 removed the hand-edited list of domain routers from this
 * file: the root tRPC router is now `MODULES.map(m => m.backend?.router)`
 * filtered for installed modules. `core` is always mounted (it's the
 * always-installed platform shell, not a domain module).
 *
 * PRD-242 US-02: the in-repo catalogue source has moved from the hand-
 * curated `KNOWN_ROUTERS` literal below to the codegen output emitted by
 * `apps/pops-api/scripts/generate-known-routers.ts`
 * (`KNOWN_ROUTERS_GENERATED`). The literal stays in place during the US-02
 * window for `git blame` continuity and is physically deleted by US-03.
 *
 * The static `AppRouter` type narrows to the modules present in `MODULES`
 * — frontend code that references an absent module fails the build via a
 * tRPC client type error rather than waiting for a runtime `NOT_FOUND`.
 *
 * `moduleGate` (`trpc.ts`) is retained as defence-in-depth: absent modules'
 * routers are not in the root, but the gate still rejects calls whose path
 * targets a known-but-uninstalled module (belt and braces).
 *
 * Runtime `mergeRouters`-based composition (the dynamic external-pillar
 * surface from PRD-228) lives alongside this static export in
 * `./runtime/compose.ts`. The express middleware reads from that runtime
 * holder so external pillars registered after boot appear without a restart.
 */
import { KNOWN_ROUTERS_GENERATED } from './generated/known-routers.js';
import { egoRouter } from './modules/cerebrum/ego/index.js';
import { cerebrumRouter } from './modules/cerebrum/index.js';
import { coreRouter } from './modules/core/index.js';
import { financeRouter } from './modules/finance/index.js';
import { foodRouter } from './modules/food/index.js';
import { installedManifests } from './modules/installed-modules.js';
import { inventoryRouter } from './modules/inventory/index.js';
import { listsRouter } from './modules/lists/index.js';
import { mediaRouter } from './modules/media/index.js';
import { router } from './trpc.js';

import type { InstalledModule } from '@pops/module-registry';

/**
 * The full mapping of module id → tRPC router for every module the API
 * binary knows how to mount. Pre-PRD-242 this was the only source of truth.
 * Today the live composition reads `KNOWN_ROUTERS_GENERATED` (PRD-242 US-01)
 * from the codegen output; the literal below is retained for `git blame`
 * continuity until PRD-242 US-03 deletes it.
 *
 * Per-property types are preserved (not widened to a common Router base)
 * so the literal shape we project to `appRouter` carries the exact nested
 * router type per key.
 */
const _KNOWN_ROUTERS_LEGACY = {
  core: coreRouter,
  cerebrum: cerebrumRouter,
  ego: egoRouter,
  finance: financeRouter,
  food: foodRouter,
  inventory: inventoryRouter,
  lists: listsRouter,
  media: mediaRouter,
};
void _KNOWN_ROUTERS_LEGACY;

type KnownRouters = typeof KNOWN_ROUTERS_GENERATED;
type KnownRouterId = keyof KnownRouters;

/**
 * Compile-time install set: `'core'` plus whichever module ids the build
 * registry committed. When `POPS_APPS=finance` is baked into `generated.ts`,
 * this collapses to `'core' | 'finance'` and the `AppRouter` type below
 * narrows automatically.
 */
type InstalledRouterId = ('core' | InstalledModule['id']) & KnownRouterId;

/**
 * The precise install set the root router exposes. `Pick` narrows the
 * codegen catalogue to only the keys in the install set so the inferred
 * `AppRouter` carries an exact set of nested router types.
 */
type InstalledRouterMap = Pick<KnownRouters, InstalledRouterId>;

function isKnownRouterId(id: string): id is KnownRouterId {
  return Object.prototype.hasOwnProperty.call(KNOWN_ROUTERS_GENERATED, id);
}

/**
 * Build the installed-router record at runtime.
 *
 * Source of truth is `installedManifests()` — it joins the build-time
 * `MODULES` install set to the live manifest exports and always includes
 * `core`. We project each manifest id back to its `KNOWN_ROUTERS_GENERATED`
 * entry; manifest ids without a matching entry (frontend-only modules such
 * as `ai`) are silently skipped — they're a no-op on the API surface.
 *
 * The runtime record is typed as `Partial<KnownRouters>` (every value, if
 * present, is the exact per-key router type from `KNOWN_ROUTERS_GENERATED`).
 * The final narrowing assertion to `InstalledRouterMap` reflects the
 * invariant that every id in `InstalledRouterId` corresponds to an entry
 * present in `MODULES` (plus `core`).
 */
function composeInstalledRouters(): InstalledRouterMap {
  const out: Partial<KnownRouters> = {};
  for (const manifest of installedManifests()) {
    if (isKnownRouterId(manifest.id)) {
      assignRouter(out, manifest.id);
    }
  }
  return out as InstalledRouterMap;
}

/**
 * Generic helper that copies the catalogue entry for `key` into `target`
 * while preserving the per-key value type. Without this generic indirection
 * TypeScript collapses `out[id] = KNOWN_ROUTERS_GENERATED[id]` to the widened
 * router supertype (every key indexes into both sides at once), which would
 * in turn widen `Partial<KnownRouters>` and break the `AppRouter`
 * inference downstream.
 */
function assignRouter<K extends KnownRouterId>(target: Partial<KnownRouters>, key: K): void {
  target[key] = KNOWN_ROUTERS_GENERATED[key];
}

/**
 * Root application router. The shape narrows to the install set baked into
 * `@pops/module-registry`; consumers (tRPC clients, OpenAPI generator)
 * statically see only the procedures of installed modules.
 *
 * The dynamic external-pillar surface (PRD-228) lives in
 * `./runtime/compose.ts` and wraps this export at boot. OpenAPI generation
 * and static type narrowing continue to read from this constant directly.
 */
export const appRouter = router(composeInstalledRouters());

/** Export the router type for use by tRPC clients. */
export type AppRouter = typeof appRouter;
