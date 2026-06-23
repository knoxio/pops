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
 *     registry's `registered` entries ARE the install set. In-repo pillars
 *     resolve via the static bundle map; external pillars (advertising
 *     `assetsBaseUrl`) via the runtime loader; backend-only pillars are
 *     dropped — exactly `walkRegistry`'s existing decision tree.
 *   - snapshot empty / fetch failed / timed out / resolves to ZERO mountable
 *     UI → fall back to the static bundle-map floor (the in-repo pillars, i.e.
 *     the pre-P7-T03 behaviour). The zero-UI case covers a live snapshot whose
 *     pillars are all backend-only (e.g. only `registry`/`orchestrator`
 *     registered mid-bring-up) — that must NOT mount an app-less shell. The
 *     shell MUST render its in-repo app set even with the registry down or
 *     mid-restart.
 *
 * The snapshot fetch itself soft-fails to `[]` (see `registry-snapshot-fetch`),
 * so an unreachable registry surfaces here as the empty-snapshot branch.
 */
import {
  fetchRegistrySnapshot,
  type RegistrySnapshotFetchOptions,
} from '@/lib/registry-snapshot-fetch';

import { WORKSPACE_BUNDLE_MAP, type BundleEntry } from './bundle-map';
import { synthesizeExternalBundleEntry, type RemoteModuleImporter } from './external-ui';
import {
  bootEntries,
  ExternalUiLoadError,
  staticFloorEntries,
  walkRegistry,
  type FrontendManifest,
  type RegistryEntry,
} from './installed-modules';
import { buildRegisteredAppsFromBundleMap } from './nav/registry';

import type { PillarSnapshot } from '@pops/pillar-sdk';

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
   * `'registry'` when the live snapshot drove the install set, `'static-floor'`
   * when the registry was unreachable and the in-repo bundle map was used.
   * Exposed for diagnostics / tests; consumers render identically either way.
   */
  readonly source: 'registry' | 'static-floor';
}

/**
 * Resolve the entry list to the bundle map the app rail walks. In-repo
 * pillars pick up their static bundle entry (carrying the real `navOrder`);
 * external pillars synthesise one from the wire descriptor via
 * `synthesizeExternalBundleEntry` — the same call the router-side walk uses —
 * so the rail orders both kinds through the single
 * `buildRegisteredAppsFromBundleMap` projection. Entries with no resolvable
 * UI surface contribute no rail entry.
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
    const inRepo = WORKSPACE_BUNDLE_MAP[entry.pillarId];
    if (inRepo !== undefined) {
      out[entry.pillarId] = inRepo;
      continue;
    }
    if (entry.assetsBaseUrl === undefined) continue;
    try {
      const synthesized = synthesizeExternalBundleEntry(
        {
          pillarId: entry.pillarId,
          assetsBaseUrl: entry.assetsBaseUrl,
          nav: entry.nav,
          pages: entry.pages,
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
}

function resolveSurface(
  entries: readonly RegistryEntry[],
  importer?: RemoteModuleImporter
): ResolvedSurface {
  return {
    manifests: walkRegistry(entries, WORKSPACE_BUNDLE_MAP, importer),
    registeredApps: buildRegisteredAppsFromBundleMap(railBundleMap(entries, importer)),
  };
}

/**
 * Resolve a registry snapshot into the boot install set.
 *
 * A non-empty snapshot is normally the source of truth: its `registered`
 * pillars ARE the install set (in-repo via the bundle map, external via the
 * runtime loader). An empty snapshot — or one that resolves to zero mountable
 * UI — falls back to the static bundle-map floor (the never-brick guarantee).
 *
 * The zero-UI fallback closes a real hole: a non-empty snapshot whose pillars
 * are all backend-only (no bundle-map hit, no `assetsBaseUrl`) — e.g. only
 * `registry` / `orchestrator` registered mid-bring-up, before the app pillars
 * have re-registered after a host restart — resolves to no manifests and no
 * rail entries. Treating that as "the registry is the source of truth" would
 * mount an app-less shell, which the resilience contract forbids. So when a
 * live snapshot resolves to an empty surface we degrade to the floor exactly
 * as if the registry were unreachable.
 *
 * `importer` is injectable so tests exercise the external-pillar path without
 * a network round-trip; production omits it and the runtime loader uses the
 * real dynamic `import()`.
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

  const floor = resolveSurface(staticFloorEntries(), importer);
  return { ...floor, source: 'static-floor' };
}

/**
 * Fetch the live registry snapshot and resolve it into the boot install set.
 * The await boundary `main.tsx` blocks first render on. Never throws: the
 * fetch soft-fails to `[]`, which resolves to the static floor.
 */
export async function fetchBootRegistry(
  options: RegistrySnapshotFetchOptions = {}
): Promise<BootRegistry> {
  const snapshot = await fetchRegistrySnapshot(options);
  return resolveBootRegistry(snapshot);
}
