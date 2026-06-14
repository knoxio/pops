/**
 * Registry-driven settings discovery (PRD-240 US-02 / ADR-037).
 *
 * `discoverSettings()` walks the live discovery snapshot, filters to
 * pillars whose manifest declares a `settings` block, flattens the
 * per-pillar `manifests` contributions, and returns the array consumers
 * iterate to render the settings UI tree. Pillars whose registration is
 * not active (`registered: false`) are skipped — mirroring
 * `publishEvent()` and `discoverSearchAdapters()`.
 *
 * Pure orchestration: discovery is injected (array or fetcher), there is
 * no module-level fetch. The helper does not own discovery; it consumes
 * it.
 *
 * Typical usage:
 *
 * ```ts
 * import { discoverSettings, findSettingsManifest } from '@pops/pillar-sdk/settings';
 *
 * const manifests = await discoverSettings({ discovery });
 * const finance = findSettingsManifest(manifests, 'finance');
 * ```
 */

import type { PillarSnapshot } from '../discovery/types.js';
import type { SettingsManifestDescriptor } from '../manifest-schema/index.js';

export type SettingsDiscoverySource =
  | readonly PillarSnapshot[]
  | (() => Promise<readonly PillarSnapshot[]>);

export interface DiscoverSettingsOptions {
  readonly discovery: SettingsDiscoverySource;
}

/**
 * Enumerate every registered pillar's settings manifest contributions
 * from the supplied discovery snapshot.
 *
 * Discovery is resolved at the time of call — passing a fetcher means a
 * fresh snapshot is read each invocation; passing an array means the
 * caller has already snapshotted. Either shape matches
 * `publishEvent()` and `discoverSearchAdapters()`.
 *
 * Results are deterministically ordered for stable UI rendering: by
 * `(pillarId, manifest.order, manifest.id)`. The pillar order matches
 * the order the registry hands them out, which is the established
 * cross-pillar iteration order for every other manifest dimension.
 *
 * Pillars whose registration is not active are skipped. Pillars that do
 * not declare a `settings` block (or declare an empty one) contribute
 * nothing — same fall-through as a pillar with no `sinks` or no
 * `searchAdapters`.
 */
export async function discoverSettings(
  options: DiscoverSettingsOptions
): Promise<readonly SettingsManifestDescriptor[]> {
  const pillars = await resolveDiscovery(options.discovery);
  const contributions: { pillarId: string; descriptor: SettingsManifestDescriptor }[] = [];

  for (const pillar of pillars) {
    if (!pillar.registered) continue;
    const manifests = pillar.manifest.settings?.manifests;
    if (manifests === undefined || manifests.length === 0) continue;
    for (const descriptor of manifests) {
      contributions.push({ pillarId: pillar.pillarId, descriptor });
    }
  }

  contributions.sort((a, b) => {
    if (a.pillarId !== b.pillarId) return a.pillarId < b.pillarId ? -1 : 1;
    if (a.descriptor.order !== b.descriptor.order) {
      return a.descriptor.order - b.descriptor.order;
    }
    if (a.descriptor.id === b.descriptor.id) return 0;
    return a.descriptor.id < b.descriptor.id ? -1 : 1;
  });

  return contributions.map((entry) => entry.descriptor);
}

/**
 * Find a single settings manifest by id in a discovery result.
 *
 * Returns `undefined` when no manifest with the given id is present —
 * callers decide whether that is a soft miss (pillar not deployed in this
 * federation) or a hard error.
 */
export function findSettingsManifest(
  manifests: readonly SettingsManifestDescriptor[],
  id: string
): SettingsManifestDescriptor | undefined {
  return manifests.find((manifest) => manifest.id === id);
}

async function resolveDiscovery(
  source: SettingsDiscoverySource
): Promise<readonly PillarSnapshot[]> {
  if (typeof source === 'function') return source();
  return source;
}
