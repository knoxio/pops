/**
 * Live-registry settings discovery for the admin Settings page
 * (settings-federation S3 / GAP-256-C).
 *
 * Replaces the build-time `MODULES` + `INSTALLED_MODULES` projection with the
 * LIVE registry: it fetches the registry snapshot, runs `discoverSettings`
 * over it, and returns one section per pillar-contributed settings manifest,
 * each tagged with its `ownerPillar` and live `hasFederatedSettings` flag so
 * the renderer routes read/write to the owning pillar (capability-gated).
 *
 * Sections are sorted by manifest `order` to preserve the prior UI ordering
 * within the registry-driven set.
 */
import { fetchSettingsSnapshot } from '@/lib/settings-snapshot';
import { useQuery } from '@tanstack/react-query';

import { discoverSettings } from '@pops/pillar-sdk/settings';

import type { SettingsManifest } from '@pops/types';

/** One settings section, with its owning pillar and live capability flag. */
export interface SettingsSection {
  readonly manifest: SettingsManifest;
  readonly ownerPillar: string;
  readonly hasFederatedSettings: boolean;
}

const SETTINGS_SECTIONS_QUERY_KEY = ['settings', 'sections'] as const;

async function loadSections(fetchImpl: typeof fetch = fetch): Promise<readonly SettingsSection[]> {
  const snapshot = await fetchSettingsSnapshot({ fetch: fetchImpl });
  const contributions = await discoverSettings({ discovery: snapshot });
  return contributions
    .map((contribution) => ({
      manifest: contribution.descriptor,
      ownerPillar: contribution.ownerPillar,
      hasFederatedSettings: contribution.capabilities?.['settings'] === true,
    }))
    .toSorted((a, b) => a.manifest.order - b.manifest.order);
}

/**
 * React-query hook exposing the live settings sections. The query key is
 * stable so the page and any peer consumers share one snapshot read.
 */
export function useSettingsSections(fetchImpl?: typeof fetch) {
  return useQuery({
    queryKey: SETTINGS_SECTIONS_QUERY_KEY,
    queryFn: async () => loadSections(fetchImpl),
  });
}
