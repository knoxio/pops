/**
 * Shell-side aggregator that turns a registry snapshot into the frontend
 * manifests the shell mounts.
 *
 * The live registry snapshot is the sole source of truth for which pillars
 * mount. The async boot path (`main.tsx` → `boot-snapshot.ts`) fetches it and
 * walks {@link bootEntries}; when the registry is unreachable the shell falls
 * back to the last good snapshot from `localStorage` (POPS-3239), and to
 * nothing when there is no cache either. There is no build-time set behind
 * that: POPS-3227 removed the static bundle map and with it the in-repo
 * "floor" the boot path used to degrade to, so an in-repo pillar and an
 * out-of-tree one reach the shell by the same one path.
 *
 * That path is the runtime loader: the walk lazily `import()`s the pillar's
 * ESM bundle from the `assetsBaseUrl` its manifest advertises and mounts the
 * slots its `pages` name. A failed remote load degrades to skipping the
 * pillar's UI, never crashing the shell.
 *
 * The registry-as-source-of-truth stance this walk implements is ADR-027.
 */
import { isInstalledModule, KNOWN_MODULES } from '@pops/module-registry';

import {
  synthesizeExternalBundleEntry,
  type RemoteModuleImporter,
  type RemoteUiDescriptor,
} from './external-ui';

import type { RouteObject } from 'react-router';

import type {
  CaptureOverlayDescriptor,
  NavConfigDescriptor,
  PageDescriptor,
  PillarSnapshot,
} from '@pops/pillar-sdk';
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
 * the fields needed to decide which UI surface to mount: the pillar id, the
 * `assetsBaseUrl`, and the wire-shaped `nav` / `pages` descriptors the runtime
 * loader consumes.
 *
 * An entry carrying only `pillarId` is a backend-only pillar and contributes
 * no UI. Sourced from the live registry snapshot via {@link bootEntries}, or
 * from the cached snapshot when the registry is unreachable.
 */
export interface RegistryEntry {
  readonly pillarId: string;
  readonly assetsBaseUrl?: string;
  readonly nav?: NavConfigDescriptor;
  readonly pages?: readonly PageDescriptor[];
  /**
   * The pillar's capture-overlay contribution. Carried through the walk like
   * `nav` and `pages`: it is a surface the bundle supplies, and while this
   * field was missing the overlay was resolvable only from the static bundle
   * map, so a loader-mounted pillar silently lost it (POPS-3266).
   */
  readonly captureOverlay?: CaptureOverlayDescriptor;
  /**
   * Bundle slots this pillar's settings groups name for a custom panel.
   *
   * Derived from the settings manifests the pillar already publishes rather
   * than added to the wire: a group that declares `widget.bundleSlot` IS the
   * declaration, and a second field naming the same slots could disagree with
   * it.
   */
  readonly settingsWidgetSlots?: readonly string[];
}

/** Every `widget.bundleSlot` the pillar's settings groups name. */
function settingsWidgetSlotsOf(manifest: PillarSnapshot['manifest']): string[] {
  const sections = manifest.settings?.manifests ?? [];
  const slots = new Set<string>();
  for (const section of sections) {
    for (const group of section.groups ?? []) {
      const slot = group.widget?.bundleSlot;
      if (slot !== undefined) slots.add(slot);
    }
  }
  return [...slots];
}

/**
 * Narrow a snapshot to what this build is allowed to mount offline.
 *
 * The LIVE registry is deliberately unfiltered: while it is answering it is
 * the source of truth, and `POPS_APPS` does not override it. The CACHED
 * snapshot is different — it is the offline floor, and the floor honours the
 * install set. Without this the
 * shell's offline behaviour would depend on whether a browser happened to
 * hold a cache: an operator who narrowed `POPS_APPS` and redeployed would
 * get the excluded module back on a returning machine and not on a fresh
 * one.
 *
 * The test is "known and excluded", not `isInstalledModule` alone. That
 * function answers false for any id outside the build-time `KNOWN_MODULES`
 * superset, which includes every genuinely external pillar the runtime
 * loader exists to mount — filtering on it would drop exactly the pillars
 * the cache is most valuable for. An id this build has never heard of was
 * never in an operator's install set to exclude, so it passes through.
 */
export function offlineInstallableSnapshot(
  snapshot: readonly PillarSnapshot[]
): readonly PillarSnapshot[] {
  const known: readonly string[] = KNOWN_MODULES;
  return snapshot.filter(
    (entry) => !known.includes(entry.pillarId) || isInstalledModule(entry.pillarId)
  );
}

/**
 * Map a live registry snapshot onto the registry-entry list the walk
 * consumes. Only `registered` pillars contribute, and for each the wire
 * `manifest` carries the UI surface (`assetsBaseUrl` / `nav` / `pages`). The
 * snapshot is the sole truth for which pillars mount — a pillar that
 * advertises no `assetsBaseUrl` is backend-only and the walk drops it.
 */
export function bootEntries(snapshot: readonly PillarSnapshot[]): readonly RegistryEntry[] {
  const out: RegistryEntry[] = [];
  for (const s of snapshot) {
    if (!s.registered) continue;
    const { assetsBaseUrl, nav, pages, captureOverlay } = s.manifest;
    const widgetSlots = settingsWidgetSlotsOf(s.manifest);
    out.push({
      pillarId: s.pillarId,
      ...(assetsBaseUrl !== undefined ? { assetsBaseUrl } : {}),
      ...(nav !== undefined ? { nav } : {}),
      ...(pages !== undefined ? { pages } : {}),
      ...(captureOverlay !== undefined ? { captureOverlay } : {}),
      ...(widgetSlots.length > 0 ? { settingsWidgetSlots: widgetSlots } : {}),
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
    captureOverlay: entry.captureOverlay,
    settingsWidgetSlots: entry.settingsWidgetSlots,
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
 * Walk a registry entry list, returning the frontend manifests the shell
 * should mount. Resolution per entry:
 *
 *   - `assetsBaseUrl` set → synthesize a manifest whose routes lazy-`import()`
 *     the remote bundle. A bad descriptor is logged and skipped; a remote
 *     bundle that fails to load later is contained by the per-route error
 *     boundary, not here.
 *   - no `assetsBaseUrl` → backend-only pillar, drop silently.
 *
 * `importer` is injectable for tests; production omits it so the loader uses
 * the real dynamic `import()`.
 */
export function walkRegistry(
  entries: readonly RegistryEntry[],
  importer?: RemoteModuleImporter
): readonly FrontendManifest[] {
  const out: FrontendManifest[] = [];
  for (const entry of entries) {
    if (entry.assetsBaseUrl !== undefined) {
      const manifest = resolveExternalManifest(
        { ...entry, assetsBaseUrl: entry.assetsBaseUrl },
        importer
      );
      if (manifest !== null) out.push(manifest);
      continue;
    }
    // A pillar that advertises no `assetsBaseUrl` contributes no UI —
    // `registry` and `orchestrator` are backend-only — so the walk drops it
    // silently. Since POPS-3227 that is the only way a pillar can be
    // dropped: there is no static map left to fall back to.
  }
  return out;
}

/**
 * Filter a manifest list to the page-routed apps the router mounts under a
 * top-level path (declares `surfaces.includes('app')` and `frontend.routes`).
 * Pure over an arbitrary manifest list: the boot path applies it to the
 * snapshot-resolved set, which since POPS-3227 is the only set there is.
 */
export function filterAppManifests(
  manifests: readonly FrontendManifest[]
): readonly (FrontendManifest & { frontend: { routes: RouteObject[] } })[] {
  return manifests.filter(
    (m): m is FrontendManifest & { frontend: { routes: RouteObject[] } } =>
      m.surfaces.includes('app') && hasRoutes(m)
  );
}
