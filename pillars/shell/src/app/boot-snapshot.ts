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
 *   - snapshot non-empty → the registry's `registered` entries ARE the install
 *     set. In-repo pillars resolve via the static bundle map; external pillars
 *     (advertising `assetsBaseUrl`) via the runtime loader; backend-only
 *     pillars are dropped — exactly `walkRegistry`'s existing decision tree.
 *   - snapshot empty / fetch failed / timed out → fall back to the static
 *     bundle-map floor (the in-repo pillars, i.e. the pre-P7-T03 behaviour).
 *     The shell MUST render its in-repo app set even with the registry down.
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
  }
  return out;
}

/**
 * Resolve a registry snapshot into the boot install set. A non-empty snapshot
 * is the source of truth; an empty one falls back to the static bundle-map
 * floor (the never-brick guarantee).
 *
 * `importer` is injectable so tests exercise the external-pillar path without
 * a network round-trip; production omits it and the runtime loader uses the
 * real dynamic `import()`.
 */
export function resolveBootRegistry(
  snapshot: readonly PillarSnapshot[],
  importer?: RemoteModuleImporter
): BootRegistry {
  const useRegistry = snapshot.length > 0;
  const entries = useRegistry ? bootEntries(snapshot) : staticFloorEntries();
  const manifests = walkRegistry(entries, WORKSPACE_BUNDLE_MAP, importer);
  const registeredApps = buildRegisteredAppsFromBundleMap(railBundleMap(entries, importer));
  return {
    manifests,
    registeredApps,
    source: useRegistry ? 'registry' : 'static-floor',
  };
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
