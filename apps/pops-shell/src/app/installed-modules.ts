/**
 * Shell-side aggregator that joins the build-time `MODULES` install set
 * (`@pops/module-registry`) with the live per-module frontend manifests
 * exported by `@pops/app-*` / `@pops/overlay-*` packages.
 *
 * Mirrors `apps/pops-api/src/modules/installed-modules.ts` on the API side
 * — the build-time registry intentionally carries only the serialisable
 * projection of each manifest; the code-bearing slots (React routes, nav
 * config, overlay component refs) live alongside the module that owns
 * them. This file is the join point on the shell.
 *
 * Adding a new module: add it to `KNOWN_FRONTEND_MANIFESTS` below AND to
 * `packages/module-registry/scripts/known-modules.ts`. The registry build
 * validates the metadata; this file binds the metadata to the live React
 * references.
 *
 * See `docs/themes/01-foundation/prds/101-plugin-contract/us-03-routing-from-registry.md`.
 */
import { manifest as aiManifest } from '@pops/app-ai';
import { manifest as cerebrumManifest } from '@pops/app-cerebrum';
import { manifest as financeManifest } from '@pops/app-finance';
import { manifest as foodManifest } from '@pops/app-food';
import { manifest as inventoryManifest } from '@pops/app-inventory';
import { manifest as listsManifest } from '@pops/app-lists';
import { manifest as mediaManifest } from '@pops/app-media';
import { INSTALLED_MODULES, MODULES } from '@pops/module-registry';
import { manifest as egoManifest } from '@pops/overlay-ego';

import type { RouteObject } from 'react-router';

import type { ModuleManifest } from '@pops/types';

/**
 * Shell-side manifest type alias. The shared `@pops/types` `ModuleManifest`
 * is generic over the routes / nav / router types so it stays
 * framework-agnostic; the shell consumes the unparameterised form and
 * narrows `frontend.routes` to `RouteObject[]` at the call site (see
 * `appRouteEntries()` in `router.tsx`).
 */
export type FrontendManifest = ModuleManifest;

/** Narrowing guard: does this manifest declare react-router routes? */
export function hasRoutes(
  manifest: FrontendManifest
): manifest is FrontendManifest & { frontend: { routes: RouteObject[] } } {
  const routes = manifest.frontend?.routes;
  return Array.isArray(routes);
}

/**
 * Every frontend manifest the shell binary knows how to mount. Keys must
 * match the corresponding registry / backend manifest `id`. Each entry's
 * declared type narrows `frontend.routes` to `RouteObject[]` (or omits it
 * entirely for overlay-only modules), so this array's inferred element
 * type already satisfies `FrontendManifest`.
 */
const KNOWN_FRONTEND_MANIFESTS: readonly FrontendManifest[] = [
  aiManifest,
  cerebrumManifest,
  egoManifest,
  financeManifest,
  foodManifest,
  inventoryManifest,
  listsManifest,
  mediaManifest,
];

function findKnownManifest(id: string): FrontendManifest | undefined {
  return KNOWN_FRONTEND_MANIFESTS.find((m) => m.id === id);
}

/**
 * Test-only override. When set, `installedFrontendManifests()` returns
 * this list verbatim instead of computing from the registry intersection.
 * Reset between tests via `__resetInstalledFrontendManifestsOverride()`.
 *
 * The override exists because `MODULES` / `INSTALLED_MODULES` are
 * computed at build / module-load time — there is no public API for
 * tests to inject synthetic module manifests into either.
 */
let testOverride: readonly FrontendManifest[] | null = null;

/**
 * Frontend manifests considered "installed" for this build — present in
 * `MODULES` (the build-time superset), inside `INSTALLED_MODULES` (the
 * runtime `POPS_APPS` / `POPS_OVERLAYS` install set per PRD-218 US-01),
 * and bound in `KNOWN_FRONTEND_MANIFESTS`. Backend-only modules (`core`)
 * are skipped at this layer: the shell has no React routes to mount for
 * them.
 */
export function installedFrontendManifests(): readonly FrontendManifest[] {
  if (testOverride !== null) return testOverride;
  const out: FrontendManifest[] = [];
  for (const m of MODULES) {
    if (!INSTALLED_MODULES.includes(m.id)) continue;
    const live = findKnownManifest(m.id);
    if (live !== undefined) out.push(live);
  }
  return out;
}

/**
 * Subset of `installedFrontendManifests()` that surfaces a page-routed app
 * (i.e. declares `surfaces.includes('app')` and `frontend.routes`). Overlay
 * mounting is US-07; this getter returns only the modules the router
 * mounts under a top-level path.
 */
export function installedAppManifests(): readonly (FrontendManifest & {
  frontend: { routes: RouteObject[] };
})[] {
  return installedFrontendManifests().filter(
    (m): m is FrontendManifest & { frontend: { routes: RouteObject[] } } =>
      m.surfaces.includes('app') && hasRoutes(m)
  );
}

/**
 * Test-only: replace the installed-manifest source with `manifests`.
 * Pass `null` to restore the production behaviour (read from `MODULES`
 * intersected with `INSTALLED_MODULES`).
 */
export function __setInstalledFrontendManifestsOverride(
  manifests: readonly FrontendManifest[] | null
): void {
  testOverride = manifests;
}

/** Test-only convenience wrapper around `__setInstalledFrontendManifestsOverride(null)`. */
export function __resetInstalledFrontendManifestsOverride(): void {
  testOverride = null;
}
