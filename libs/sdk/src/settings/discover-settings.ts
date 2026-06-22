/**
 * Registry-driven settings discovery (PRD-240 US-02 / ADR-037;
 * settings-federation S3 — see `docs/plans/02-settings-federation.md`).
 *
 * `discoverSettings()` walks the live discovery snapshot, filters to
 * pillars whose manifest declares a `settings` block, flattens the
 * per-pillar `manifests` contributions, and returns an array of
 * `{ ownerPillar, descriptor, capabilities }` entries the shell iterates
 * to render the settings UI tree AND to route each section's read/write to
 * the OWNING pillar (capability-gated). Pillars whose registration is not
 * active (`registered: false`) are skipped — mirroring `publishEvent()`
 * and `discoverSearchAdapters()`.
 *
 * `ownerPillar` is the pillar the descriptor came from; the shell resolves
 * its settings transport from it. `capabilities` is the pillar's live
 * self-reported capability map (settings-federation GAP-256-D) — the shell
 * routes a section's writes to `/<ownerPillar>-api/settings` only when
 * `capabilities.settings === true`, and otherwise falls back to core.
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
 * const sections = await discoverSettings({ discovery });
 * const finance = findSettingsManifest(sections, 'finance');
 * ```
 */

import type { CapabilityStatuses } from '../bootstrap/transport.js';
import type { PillarSnapshot } from '../discovery/types.js';
import type { SettingsManifestDescriptor } from '../manifest-schema/index.js';

export type SettingsDiscoverySource =
  | readonly PillarSnapshot[]
  | (() => Promise<readonly PillarSnapshot[]>);

export interface DiscoverSettingsOptions {
  readonly discovery: SettingsDiscoverySource;
}

/**
 * One settings-manifest contribution tagged with its owning pillar and
 * that pillar's live capabilities. The shell renders `descriptor` and
 * routes its read/write to `ownerPillar` gated on
 * `capabilities?.settings === true`.
 */
export interface SettingsContribution {
  readonly ownerPillar: string;
  readonly descriptor: SettingsManifestDescriptor;
  readonly capabilities?: CapabilityStatuses;
}

/**
 * Enumerate every registered pillar's settings manifest contributions
 * from the supplied discovery snapshot, tagged with their owning pillar
 * and that pillar's live capabilities.
 *
 * Discovery is resolved at the time of call — passing a fetcher means a
 * fresh snapshot is read each invocation; passing an array means the
 * caller has already snapshotted. Either shape matches
 * `publishEvent()` and `discoverSearchAdapters()`.
 *
 * Results are deterministically ordered for stable UI rendering: by
 * `(ownerPillar, descriptor.order, descriptor.id)`. The pillar order
 * matches the order the registry hands them out, which is the established
 * cross-pillar iteration order for every other manifest dimension.
 *
 * Pillars whose registration is not active are skipped. Pillars that do
 * not declare a `settings` block (or declare an empty one) contribute
 * nothing — same fall-through as a pillar with no `sinks` or no
 * `searchAdapters`.
 */
export async function discoverSettings(
  options: DiscoverSettingsOptions
): Promise<readonly SettingsContribution[]> {
  const pillars = await resolveDiscovery(options.discovery);
  const contributions: SettingsContribution[] = [];

  for (const pillar of pillars) {
    if (!pillar.registered) continue;
    const manifests = pillar.manifest.settings?.manifests;
    if (manifests === undefined || manifests.length === 0) continue;
    for (const descriptor of manifests) {
      contributions.push({
        ownerPillar: pillar.pillarId,
        descriptor,
        ...(pillar.capabilities !== undefined ? { capabilities: pillar.capabilities } : {}),
      });
    }
  }

  contributions.sort((a, b) => {
    if (a.ownerPillar !== b.ownerPillar) return a.ownerPillar < b.ownerPillar ? -1 : 1;
    if (a.descriptor.order !== b.descriptor.order) {
      return a.descriptor.order - b.descriptor.order;
    }
    if (a.descriptor.id === b.descriptor.id) return 0;
    return a.descriptor.id < b.descriptor.id ? -1 : 1;
  });

  return contributions;
}

/**
 * Find a single settings contribution by manifest id in a discovery
 * result.
 *
 * Returns `undefined` when no manifest with the given id is present —
 * callers decide whether that is a soft miss (pillar not deployed in this
 * federation) or a hard error.
 */
export function findSettingsManifest(
  contributions: readonly SettingsContribution[],
  id: string
): SettingsContribution | undefined {
  return contributions.find((contribution) => contribution.descriptor.id === id);
}

async function resolveDiscovery(
  source: SettingsDiscoverySource
): Promise<readonly PillarSnapshot[]> {
  if (typeof source === 'function') return source();
  return source;
}
