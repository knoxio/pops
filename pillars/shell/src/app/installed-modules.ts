/**
 * Shell-side aggregator that resolves the shell's install set against the
 * workspace bundle map (`./bundle-map.tsx`) — the single place the shell
 * enumerates in-repo pillar ids. Every installed pillar id resolves through
 * the workspace bundle map.
 *
 * Install-set source: the live registry snapshot is the source of truth for
 * which pillars mount, not the build-time `MODULES` / `INSTALLED_MODULES`
 * constants. The async boot path (`main.tsx` → `boot-snapshot.ts`) fetches
 * the snapshot and walks {@link bootEntries}; if the registry is unreachable
 * the shell falls back to {@link staticFloorEntries} (the in-repo bundle-map
 * pillars) so it never bricks. `installedFrontendManifests()` is that static
 * floor — the synchronous in-repo set the boot path degrades to, and the
 * source the capture-overlay / manifest-validation tests read.
 *
 * External pillars that the registry advertises via `assetsBaseUrl` are
 * absent from the workspace bundle map by design (ADR-002 keeps the in-repo
 * FE a single static SPA). For those the walk takes the runtime path
 * (Option A): it lazily `import()`s the pillar's ESM bundle from the
 * advertised URL and mounts it like an in-repo module. A failed remote load
 * degrades to skipping the pillar's UI, never crashing the shell.
 *
 * See `docs/themes/federation/prds/registry-driven-shell-ui`.
 */
import { isInstalledModule } from '@pops/module-registry';

import { WORKSPACE_BUNDLE_MAP, type BundleEntry } from './bundle-map';
import {
  synthesizeExternalBundleEntry,
  type RemoteModuleImporter,
  type RemoteUiDescriptor,
} from './external-ui';

import type { RouteObject } from 'react-router';

import type { NavConfigDescriptor, PageDescriptor, PillarSnapshot } from '@pops/pillar-sdk';
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
 * Raised when synthesizing the UI surface for an external pillar fails at
 * walk time (e.g. the registry advertised an `assetsBaseUrl` but the
 * descriptor is structurally unusable). Caught in `walkRegistry()` so the
 * shell logs once and skips that pillar's UI instead of crashing the boot.
 *
 * Failures that happen *later* — when the remote bundle is actually
 * imported on first navigation — are contained by the per-route
 * `<ErrorBoundary>` the external loader wraps each page in, not by this
 * error. This type covers only the synchronous synthesis step.
 */
export class ExternalUiLoadError extends Error {
  override readonly name = 'ExternalUiLoadError';
  readonly pillarId: string;
  readonly assetsBaseUrl: string;

  constructor(pillarId: string, assetsBaseUrl: string, cause?: unknown) {
    super(`external UI load failed (pillarId=${pillarId}, assetsBaseUrl=${assetsBaseUrl})`, {
      cause,
    });
    this.pillarId = pillarId;
    this.assetsBaseUrl = assetsBaseUrl;
  }
}

/**
 * Minimal "registry entry" shape the shell walks. Mirrors the
 * `PillarSnapshot` projection `discoverSettings()` reads but carries only
 * the fields needed to decide which UI surface to mount: the pillar id,
 * and — for external pillars absent from the workspace bundle map — the
 * `assetsBaseUrl` plus the wire-shaped `nav` / `pages` descriptors the
 * runtime loader consumes.
 *
 * In-repo pillars carry only `pillarId`: their UI surface comes from the
 * static bundle map, never the wire. Sourced from the live registry
 * snapshot via {@link bootEntries}, or from the in-repo bundle map via
 * {@link staticFloorEntries} when the registry is unreachable.
 */
export interface RegistryEntry {
  readonly pillarId: string;
  readonly assetsBaseUrl?: string;
  readonly nav?: NavConfigDescriptor;
  readonly pages?: readonly PageDescriptor[];
}

/**
 * The static install-set floor: the in-repo pillars the shell renders when
 * the live registry is unreachable (the never-brick fallback), and the
 * synchronous source `installedFrontendManifests()` walks.
 *
 * The floor is the workspace bundle map narrowed by the runtime install
 * shim `isInstalledModule` (the `@pops/module-registry` projection of the
 * build-time `POPS_APPS` contract). The LIVE install set comes from the
 * registry snapshot (`bootEntries`) and is the source of truth; this floor
 * only governs the offline path. Honouring the install shim here means an
 * operator's `POPS_APPS` selection still narrows the shell when the registry
 * is down (and the finance-only install-set e2e stays meaningful) — without
 * the shell consulting the build-time `MODULES` superset for the live
 * install set. In-repo pillars carry only `pillarId`; their UI surface comes
 * from the static bundle map.
 */
export function staticFloorEntries(): readonly RegistryEntry[] {
  return Object.keys(WORKSPACE_BUNDLE_MAP)
    .filter((pillarId) => isInstalledModule(pillarId))
    .map((pillarId) => ({ pillarId }));
}

/**
 * Map a live registry snapshot onto the registry-entry list the walk
 * consumes. Only `registered` pillars contribute. For each, the wire
 * `manifest` carries the external-UI surface
 * (`assetsBaseUrl` / `nav` / `pages`); in-repo pillars omit `assetsBaseUrl`
 * and resolve through the static bundle map instead. The snapshot is the
 * sole truth for which pillars mount — backend-only pillars (no bundle-map
 * entry, no `assetsBaseUrl`) are dropped by the walk's existing decision
 * tree.
 */
export function bootEntries(snapshot: readonly PillarSnapshot[]): readonly RegistryEntry[] {
  const out: RegistryEntry[] = [];
  for (const s of snapshot) {
    if (!s.registered) continue;
    const { assetsBaseUrl, nav, pages } = s.manifest;
    out.push({
      pillarId: s.pillarId,
      ...(assetsBaseUrl !== undefined ? { assetsBaseUrl } : {}),
      ...(nav !== undefined ? { nav } : {}),
      ...(pages !== undefined ? { pages } : {}),
    });
  }
  return out;
}

/**
 * Resolve an external pillar's UI surface into a frontend manifest, or
 * `null` to skip it. Wraps `synthesizeExternalBundleEntry` so any
 * synchronous failure is logged once and contained — the shell never
 * crashes because an external pillar shipped a bad descriptor.
 *
 * `importer` defaults (inside the synthesizer) to a dynamic `import()` of
 * the advertised URL; tests inject a fake to exercise the path offline.
 */
function resolveExternalManifest(
  entry: RegistryEntry & { assetsBaseUrl: string },
  importer?: RemoteModuleImporter
): FrontendManifest | null {
  const descriptor: RemoteUiDescriptor = {
    pillarId: entry.pillarId,
    assetsBaseUrl: entry.assetsBaseUrl,
    nav: entry.nav,
    pages: entry.pages,
  };
  try {
    const synthesized = synthesizeExternalBundleEntry(descriptor, importer);
    if (synthesized === null) {
      // Advertised an asset URL but no `nav` / `pages` — nothing to mount.
      // Treated like a backend-only pillar.
      return null;
    }
    return synthesized.manifest;
  } catch (cause) {
    const err = new ExternalUiLoadError(entry.pillarId, entry.assetsBaseUrl, cause);
    console.warn(`[installed-modules] ${err.message}`, cause);
    return null;
  }
}

/**
 * Walk a registry entry list against a workspace bundle map, returning
 * the frontend manifests the shell should mount. Resolution per id:
 *
 *   - Bundle map hit → emit the in-repo workspace manifest (ADR-002:
 *     statically bundled, unchanged).
 *   - Bundle map miss + `assetsBaseUrl` set → external pillar. Synthesize a
 *     manifest whose routes lazy-`import()` the remote bundle (Option A). A
 *     bad descriptor is logged and skipped; a remote bundle that fails to
 *     load later is contained by the per-route error boundary, not here.
 *   - Bundle map miss + no `assetsBaseUrl` → backend-only pillar, drop
 *     silently.
 *
 * `importer` is injectable for tests; production omits it so the external
 * loader uses the real dynamic `import()`.
 */
export function walkRegistry(
  entries: readonly RegistryEntry[],
  bundleMap: Readonly<Record<string, BundleEntry>>,
  importer?: RemoteModuleImporter
): readonly FrontendManifest[] {
  const out: FrontendManifest[] = [];
  for (const entry of entries) {
    const bundle = bundleMap[entry.pillarId];
    if (bundle !== undefined) {
      out.push(bundle.manifest);
      continue;
    }
    if (entry.assetsBaseUrl !== undefined) {
      const manifest = resolveExternalManifest(
        { ...entry, assetsBaseUrl: entry.assetsBaseUrl },
        importer
      );
      if (manifest !== null) out.push(manifest);
      continue;
    }
    // Backend-only pillars (e.g. `registry`) sit in `MODULES` but contribute
    // no UI. They never appear in the bundle map and they never advertise
    // an `assetsBaseUrl`, so the walk drops them silently.
  }
  return out;
}

/**
 * Test-only override. When set, `installedFrontendManifests()` returns
 * this list verbatim instead of walking the static floor.
 * Reset between tests via `__resetInstalledFrontendManifestsOverride()`.
 *
 * The override exists so tests can inject synthetic module manifests
 * without standing up the workspace bundle map.
 */
let testOverride: readonly FrontendManifest[] | null = null;

/**
 * The static install-set floor as frontend manifests: every in-repo
 * pillar in the workspace bundle map, walked through {@link walkRegistry}.
 *
 * This is the synchronous in-repo set the live install-set degrades to when
 * the registry is unreachable, and the source the capture-overlay walk and
 * manifest-validation tests read. The live,
 * snapshot-driven install set is built by the async boot path
 * (`boot-snapshot.ts`), not here.
 */
export function installedFrontendManifests(): readonly FrontendManifest[] {
  if (testOverride !== null) return testOverride;
  return walkRegistry(staticFloorEntries(), WORKSPACE_BUNDLE_MAP);
}

/**
 * Filter a manifest list to the page-routed apps the router mounts under a
 * top-level path (declares `surfaces.includes('app')` and `frontend.routes`).
 * Pure over an arbitrary manifest list so the boot path can apply it to the
 * snapshot-resolved set, not just the static floor.
 */
export function filterAppManifests(
  manifests: readonly FrontendManifest[]
): readonly (FrontendManifest & { frontend: { routes: RouteObject[] } })[] {
  return manifests.filter(
    (m): m is FrontendManifest & { frontend: { routes: RouteObject[] } } =>
      m.surfaces.includes('app') && hasRoutes(m)
  );
}

/**
 * Subset of `installedFrontendManifests()` (the static floor) that surfaces a
 * page-routed app. Retained for the synchronous in-repo consumers; the live
 * router builds from the boot-resolved set via {@link filterAppManifests}.
 */
export function installedAppManifests(): readonly (FrontendManifest & {
  frontend: { routes: RouteObject[] };
})[] {
  return filterAppManifests(installedFrontendManifests());
}

/**
 * Test-only: replace the installed-manifest source with `manifests`.
 * Pass `null` to restore the production behaviour (walk the registry).
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
