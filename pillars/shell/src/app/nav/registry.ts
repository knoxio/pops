/**
 * App-rail registry — derived from a walk over the resolved bundle entries.
 *
 * The walk iterates the record the boot resolver builds (one entry per mounted
 * pillar), picks up each entry's
 * `manifest.frontend.navConfig`, and sorts by the entry-level `navOrder`
 * (mirrors `nav.order` on the pillar's wire-format manifest payload). Ties
 * break lexicographically on the nav `id` so authoring order is
 * deterministic without tight numbering.
 */
import type { BundleEntry } from '../bundle-entry';
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
 * Build the app-rail registry from a record of resolved bundle entries.
 * Exported taking the record rather than reading one so a test can drive a
 * synthetic set, and so the boot resolver stays the only thing that builds
 * the real one.
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

export type { AppNavConfig, AppNavItem } from './types';
