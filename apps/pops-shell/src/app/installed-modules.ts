/**
 * Shell-side aggregator that joins the build-time `MODULES` install set
 * (`@pops/module-registry`) with the workspace bundle map
 * (`./bundle-map.ts`) — the single place the shell still enumerates
 * in-repo pillar ids per PRD-243 US-03.
 *
 * Prior to PRD-243 this file hand-imported each pillar's frontend
 * manifest by name and reduced the registry intersection through the
 * `KNOWN_FRONTEND_MANIFESTS` literal. The registry walk replaces both:
 * every installed pillar id resolves through `lookupBundleEntry()`,
 * which fronts the workspace bundle map.
 *
 * External pillars (PRD-228) that the registry advertises via
 * `assetsBaseUrl` are absent from the workspace bundle map by design
 * (ADR-002 keeps the in-repo FE a single static SPA). For those the walk
 * takes the runtime path (PRD-243 US-05, Option A): it lazily `import()`s
 * the pillar's ESM bundle from the advertised URL and mounts it like an
 * in-repo module. A failed remote load degrades to skipping the pillar's
 * UI, never crashing the shell.
 *
 * See `docs/themes/13-pillar-finale/prds/243-registry-driven-shell-ui/us-03-shell-registry-walk.md`
 * and `us-05-external-pillar-ui-loading.md`.
 */
import { INSTALLED_MODULES, MODULES } from '@pops/module-registry';

import { WORKSPACE_BUNDLE_MAP, type BundleEntry } from './bundle-map';
import {
  synthesizeExternalBundleEntry,
  type RemoteModuleImporter,
  type RemoteUiDescriptor,
} from './external-ui';

import type { RouteObject } from 'react-router';

import type { NavConfigDescriptor, PageDescriptor } from '@pops/pillar-sdk';
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
 * `PillarSnapshot` projection `discoverSettings()` reads (PRD-240) but
 * carries only the fields PRD-243 needs to decide which UI surface to
 * mount: the pillar id, and — for external pillars (PRD-228) absent from
 * the workspace bundle map — the `assetsBaseUrl` plus the wire-shaped
 * `nav` / `pages` descriptors the runtime loader (US-05) consumes.
 *
 * In-repo pillars carry only `pillarId`: their UI surface comes from the
 * static bundle map, never the wire. Backed by `MODULES` +
 * `INSTALLED_MODULES` today; PRD-228 wires the runtime registry behind
 * the same shape so external pillars flow through the same walk.
 */
export interface RegistryEntry {
  readonly pillarId: string;
  readonly assetsBaseUrl?: string;
  readonly nav?: NavConfigDescriptor;
  readonly pages?: readonly PageDescriptor[];
}

/**
 * Build the default registry-entry list from the build-time `MODULES`
 * snapshot intersected with the runtime `INSTALLED_MODULES` shim. The
 * synchronous walk source the shell uses at boot.
 */
function defaultRegistryEntries(): readonly RegistryEntry[] {
  const out: RegistryEntry[] = [];
  for (const module of MODULES) {
    if (!INSTALLED_MODULES.includes(module.id)) continue;
    out.push({ pillarId: module.id });
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
 *   - Bundle map miss + `assetsBaseUrl` set → external pillar (PRD-228).
 *     Synthesize a manifest whose routes lazy-`import()` the remote bundle
 *     (PRD-243 US-05, Option A). A bad descriptor is logged and skipped;
 *     a remote bundle that fails to load later is contained by the
 *     per-route error boundary, not here.
 *   - Bundle map miss + no `assetsBaseUrl` → backend-only pillar, drop
 *     silently. Mirrors the pre-PRD-243 behaviour where backend-only
 *     ids simply weren't in `KNOWN_FRONTEND_MANIFESTS`.
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
    // Backend-only pillars (e.g. `core`) sit in `MODULES` but contribute
    // no UI. They never appear in the bundle map and they never advertise
    // an `assetsBaseUrl`, so the walk drops them silently — mirroring the
    // pre-PRD-243 behaviour where they simply weren't in
    // `KNOWN_FRONTEND_MANIFESTS`.
  }
  return out;
}

/**
 * Test-only override. When set, `installedFrontendManifests()` returns
 * this list verbatim instead of computing from the registry walk.
 * Reset between tests via `__resetInstalledFrontendManifestsOverride()`.
 *
 * The override exists because `MODULES` / `INSTALLED_MODULES` are
 * computed at build / module-load time — there is no public API for
 * tests to inject synthetic module manifests into either. PRD-243 US-04
 * is the integration test that exercises the live walk against a
 * synthetic registry without using this hook.
 */
let testOverride: readonly FrontendManifest[] | null = null;

/**
 * Frontend manifests considered "installed" for this build. Walks the
 * registry: every id in the `MODULES` superset that survives the runtime
 * install set (`INSTALLED_MODULES`, per PRD-218 US-01) is resolved
 * against the workspace bundle map.
 *
 * Skip path: a registered id with no entry in the workspace bundle map
 * AND no `assetsBaseUrl` to defer to logs a warning and is omitted —
 * external pillars (US-05 deferred) fall here today.
 */
export function installedFrontendManifests(): readonly FrontendManifest[] {
  if (testOverride !== null) return testOverride;
  return walkRegistry(defaultRegistryEntries(), WORKSPACE_BUNDLE_MAP);
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
