/**
 * App-rail registry — derived from a walk over the workspace bundle map.
 *
 * The walk iterates the workspace bundle map, picks up each entry's
 * `manifest.frontend.navConfig`, and sorts by the entry-level `navOrder`
 * (mirrors `nav.order` on the pillar's wire-format manifest payload). Ties
 * break lexicographically on the nav `id` so authoring order is
 * deterministic without tight numbering.
 */
import { WORKSPACE_BUNDLE_MAP, type BundleEntry } from '../bundle-map';

import type { AppNavConfig } from './types';

interface RankedNavConfig {
  readonly order: number;
  readonly nav: AppNavConfig;
}

function navConfigFromManifest(manifest: unknown): AppNavConfig | undefined {
  if (typeof manifest !== 'object' || manifest === null) return undefined;
  const frontend = (manifest as { frontend?: { navConfig?: unknown } }).frontend;
  if (frontend === undefined) return undefined;
  const navConfig = frontend.navConfig;
  if (typeof navConfig !== 'object' || navConfig === null) return undefined;
  return navConfig as AppNavConfig;
}

function compareRankedNav(a: RankedNavConfig, b: RankedNavConfig): number {
  if (a.order !== b.order) return a.order - b.order;
  if (a.nav.id === b.nav.id) return 0;
  return a.nav.id < b.nav.id ? -1 : 1;
}

/**
 * Build the app-rail registry from a bundle map snapshot. Exported so the
 * test suite can exercise the walk against a synthetic bundle map without
 * mutating the live `WORKSPACE_BUNDLE_MAP` singleton.
 */
export function buildRegisteredAppsFromBundleMap(
  bundleMap: Readonly<Record<string, BundleEntry>>
): AppNavConfig[] {
  const ranked: RankedNavConfig[] = [];
  for (const entry of Object.values(bundleMap)) {
    const nav = navConfigFromManifest(entry.manifest);
    if (nav === undefined) continue;
    ranked.push({ order: entry.navOrder, nav });
  }
  ranked.sort(compareRankedNav);
  return ranked.map((entry) => entry.nav);
}

/**
 * The static app-rail floor: every in-repo pillar in the workspace bundle
 * map, sorted by `navOrder` ascending with a stable lexicographic tiebreak
 * on `id`. The display order (`finance, media, inventory, food, lists,
 * cerebrum, ai`) follows the sparse `navOrder` scheme in `bundle-map.tsx`.
 *
 * The live app rail does not read this constant — it reads the
 * boot-resolved install set from `BootRegistryProvider`
 * (`useRegisteredApps()`), which is the registry snapshot (or this floor
 * when the registry is unreachable). This export is the floor the boot
 * path falls back to and the order the parity gate pins.
 */
export const registeredApps: AppNavConfig[] =
  buildRegisteredAppsFromBundleMap(WORKSPACE_BUNDLE_MAP);

export type { AppNavConfig, AppNavItem } from './types';
