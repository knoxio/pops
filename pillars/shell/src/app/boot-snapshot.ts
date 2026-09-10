/**
 * Boot install-set resolver (P7-T03 / RD-3) — the async boot boundary that
 * makes the live registry snapshot the source of truth for which pillars the
 * shell mounts.
 *
 * The shell historically built its router + app rail synchronously at
 * module-eval time from the build-time `MODULES` constant. This module moves
 * that decision behind an `await`: `main.tsx` fetches the registry snapshot
 * before first render, resolves it here into a {@link BootRegistry}
 * (`{ manifests, registeredApps }`), then builds the router and seeds the nav
 * context from the resolved value.
 *
 * Resilience contract (never brick the shell):
 *
 *   - snapshot non-empty AND it resolves to ≥1 mountable UI surface → the
 *     registry's `registered` entries ARE the install set. Every pillar
 *     advertising an `assetsBaseUrl` resolves through the runtime loader;
 *     backend-only pillars are dropped — exactly `walkRegistry`'s decision.
 *   - snapshot empty / fetch failed / timed out / resolves to ZERO mountable
 *     UI → fall back to the last good snapshot in `localStorage` (POPS-3239),
 *     and to nothing when there is no cache. The zero-UI case covers a live
 *     snapshot whose pillars are all backend-only (e.g. only
 *     `registry`/`orchestrator` registered mid-bring-up) — that must NOT be
 *     read as an install set of none. Whatever the tier, the shell renders
 *     its own chrome rather than crashing.
 *
 * The snapshot fetch itself soft-fails to `[]` (see `registry-snapshot-fetch`),
 * so an unreachable registry surfaces here as the empty-snapshot branch.
 */
import {
  fetchRegistrySnapshot,
  type RegistrySnapshotFetchOptions,
} from '@/lib/registry-snapshot-fetch';

import { synthesizeExternalBundleEntry, type RemoteModuleImporter } from './external-ui';
import {
  bootEntries,
  ExternalUiLoadError,
  offlineInstallableSnapshot,
  walkRegistry,
  type FrontendManifest,
  type RegistryEntry,
} from './installed-modules';
import { buildRegisteredAppsFromBundleMap } from './nav/registry';
import {
  cacheRegistrySnapshot,
  clearCachedRegistrySnapshot,
  readCachedRegistrySnapshot,
  type SnapshotStore,
} from './snapshot-cache';

import type { PillarSnapshot } from '@pops/pillar-sdk';

import type { BundleEntry } from './bundle-entry';
import type { AppNavConfig } from './nav/types';

/**
 * The resolved boot install set the shell renders. `manifests` drives the
 * router's app routes; `registeredApps` drives the app rail / sidebar / page
 * nav / index redirect.
 */
export interface BootRegistry {
  readonly manifests: readonly FrontendManifest[];
  readonly registeredApps: readonly AppNavConfig[];
  /**
   * `assetsBaseUrl` of every mounted pillar the runtime loader will import,
   * so boot can `modulepreload` them rather than leaving the first request
   * until the reader navigates (`preload-remote-bundles.ts`). Only pillars
   * that actually resolved to a mounted surface appear — an operator's
   * install-set selection is honoured here as everywhere else.
   */
  readonly remoteBundleUrls: readonly string[];
  /**
   * The resolved bundle map — every entry synthesized for its loader-mounted
   * pillar. Exposed because a pillar contributes surfaces beyond its pages:
   * the capture-overlay and settings-widget registries resolve a slot through
   * a `BundleEntry`, and resolving it against the old STATIC map would
   * silently lose those surfaces for every pillar that had left it
   * (POPS-3266).
   */
  readonly bundleMap: Readonly<Record<string, BundleEntry>>;
  /**
   * Where the install set came from: `'registry'` for a live snapshot,
   * `'cached-snapshot'` for the last one that worked, and `'empty'` when
   * neither answered — there is no third source since POPS-3227 removed the
   * static bundle map. Exposed for diagnostics / tests; consumers render
   * identically whichever it is.
   */
  readonly source: 'registry' | 'cached-snapshot' | 'empty';
}

/**
 * Resolve the entry list to the bundle map the app rail walks. Every entry is
 * synthesised from its wire descriptor via `synthesizeExternalBundleEntry` —
 * the same call the router-side walk uses — so `buildRegisteredAppsFromBundleMap`
 * projects a single, uniform record. Entries with no resolvable UI surface
 * contribute no rail entry.
 *
 * Synthesis is wrapped in the same `try/catch` the router-side
 * `resolveExternalManifest` uses (`installed-modules.ts`): a structurally
 * broken external descriptor logs once and is skipped on the rail path too,
 * so the two walks stay symmetric and a bad descriptor can never throw out of
 * boot resolution via the rail.
 */
function railBundleMap(
  entries: readonly RegistryEntry[],
  importer?: RemoteModuleImporter
): Record<string, BundleEntry> {
  const out: Record<string, BundleEntry> = {};
  for (const entry of entries) {
    if (entry.assetsBaseUrl === undefined) continue;
    try {
      const synthesized = synthesizeExternalBundleEntry(
        {
          pillarId: entry.pillarId,
          assetsBaseUrl: entry.assetsBaseUrl,
          nav: entry.nav,
          pages: entry.pages,
          captureOverlay: entry.captureOverlay,
          settingsWidgetSlots: entry.settingsWidgetSlots,
        },
        importer
      );
      if (synthesized !== null) out[entry.pillarId] = synthesized;
    } catch (cause) {
      const err = new ExternalUiLoadError(entry.pillarId, entry.assetsBaseUrl, cause);
      console.warn(`[boot-snapshot] ${err.message}`, cause);
    }
  }
  return out;
}

/**
 * The router manifests + app-rail nav an entry list resolves to. The two
 * always travel together (the router and the rail must agree on the mounted
 * set), so the resolver computes them in one pass and the never-brick check
 * inspects both before deciding whether a snapshot yielded any UI.
 */
interface ResolvedSurface {
  readonly manifests: readonly FrontendManifest[];
  readonly registeredApps: readonly AppNavConfig[];
  readonly remoteBundleUrls: readonly string[];
  readonly bundleMap: Readonly<Record<string, BundleEntry>>;
}

function resolveSurface(
  entries: readonly RegistryEntry[],
  importer?: RemoteModuleImporter
): ResolvedSurface {
  const bundleMap = railBundleMap(entries, importer);
  return {
    bundleMap,
    manifests: walkRegistry(entries, importer),
    registeredApps: buildRegisteredAppsFromBundleMap(bundleMap),
    // Read off the resolved map rather than the raw entries: a pillar that
    // advertised a URL but no mountable surface is not in the map, and
    // preloading a bundle nothing will import is a request for nothing.
    remoteBundleUrls: Object.values(bundleMap)
      .map((entry) => entry.assetsBaseUrl)
      .filter((url): url is string => url !== undefined),
  };
}

/**
 * Resolve a registry snapshot into the boot install set.
 *
 * A non-empty snapshot is normally the source of truth: its `registered`
 * pillars ARE the install set, each mounted through the runtime loader. An
 * empty snapshot — or one that resolves to zero mountable UI — reports
 * `source: 'empty'`, and `fetchBootRegistry` is what tries the cached snapshot
 * before returning it.
 *
 * The zero-UI case is a real hole rather than a hypothetical: a non-empty
 * snapshot whose pillars are all backend-only (no `assetsBaseUrl`) — e.g. only
 * `registry` / `orchestrator` registered mid-bring-up, before the app pillars
 * have re-registered after a host restart — resolves to no manifests and no
 * rail entries. Reporting that as `'registry'` would take a mid-restart fleet
 * for a deliberate install set of none, and cost the reader the cached
 * snapshot that would have rendered.
 *
 * `importer` is injectable so tests exercise the loader path without a network
 * round-trip; production omits it and the loader uses the real dynamic
 * `import()`.
 */
export function resolveBootRegistry(
  snapshot: readonly PillarSnapshot[],
  importer?: RemoteModuleImporter
): BootRegistry {
  const registryEntries = snapshot.length > 0 ? bootEntries(snapshot) : null;

  if (registryEntries !== null) {
    const surface = resolveSurface(registryEntries, importer);
    if (surface.manifests.length > 0 || surface.registeredApps.length > 0) {
      return { ...surface, source: 'registry' };
    }
  }

  // Nothing left to fall back to. The static bundle map was the third tier
  // until POPS-3227 emptied it, and the second — the cached snapshot — is
  // what `fetchBootRegistry` reaches for before returning this. A shell that
  // has never successfully reached the registry renders its own chrome and no
  // pillars, which is a resolved state rather than a crash (POPS-3250 covers
  // what the reader is told on those routes).
  return { ...resolveSurface([], importer), source: 'empty' };
}

/**
 * What `fetchBootRegistry` takes: the snapshot fetch's own options, plus the
 * store the cached-snapshot floor reads and writes. `store` is injectable so a
 * test can drive its own object rather than the ambient `localStorage`.
 */
export interface BootRegistryOptions extends RegistrySnapshotFetchOptions {
  readonly store?: SnapshotStore;
}

/**
 * Fetch the live registry snapshot and resolve it into the boot install set.
 * The await boundary `main.tsx` blocks first render on. Never throws.
 *
 * Three tiers, in order, each a fallback for the one before:
 *
 *   1. the live snapshot, whenever it resolves to a mountable surface;
 *   2. when tier 1 gives nothing, the cached snapshot — the last one that did,
 *      held in `localStorage` and narrowed by the install set, which is the
 *      whole of the offline floor since POPS-3239;
 *   3. nothing. POPS-3227 removed the static bundle map that used to be this
 *      tier, so a first visit with the registry down renders the shell's own
 *      chrome and no pillars.
 *
 * The fetch soft-fails to `[]`, so an unreachable registry arrives here as
 * tier 1 resolving to nothing rather than as a throw.
 */
export async function fetchBootRegistry(options: BootRegistryOptions = {}): Promise<BootRegistry> {
  const { store, ...fetchOptions } = options;
  const snapshot = await fetchRegistrySnapshot(fetchOptions);

  const live = resolveBootRegistry(snapshot);
  if (live.source === 'registry') {
    // Only a snapshot that actually resolved to a surface is worth keeping: a
    // cached one that mounts nothing would replace a good floor with a useless
    // one, which is worse than having no cache at all.
    cacheRegistrySnapshot(snapshot, store);
    return live;
  }

  // The live snapshot gave nothing mountable — unreachable registry, an empty
  // list, or only backend-only pillars mid-bring-up. The set that answered
  // last time is the offline floor: POPS-3215 shrank the build's compiled-in
  // floor to nothing pillar by pillar, and POPS-3227 removed it outright
  // (POPS-3239).
  // Narrowed by the install set, because this is the offline floor and the
  // floor honours `POPS_APPS` — see `offlineInstallableSnapshot`.
  const cached = offlineInstallableSnapshot(readCachedRegistrySnapshot(store));
  if (cached.length > 0) {
    const fromCache = resolveBootRegistry(cached);
    // `source === 'registry'` is the test, not `cached.length > 0`: a
    // non-empty cached snapshot can still resolve to zero mountable UI (e.g.
    // only backend-only pillars), which `resolveBootRegistry` reports as
    // `'empty'` — labelling that `cached-snapshot` would claim a floor the
    // cache did not actually supply.
    if (fromCache.source === 'registry') {
      return { ...fromCache, source: 'cached-snapshot' };
    }
    // Cached, and no longer resolves to anything — every pillar in it has left
    // the build. Keeping it would fail the same way on every boot.
    clearCachedRegistrySnapshot(store);
  }

  return live;
}
