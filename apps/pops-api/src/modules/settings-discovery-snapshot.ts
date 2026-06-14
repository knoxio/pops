/**
 * Local PillarSnapshot factory for settings discovery in the API monolith
 * (PRD-240 US-04).
 *
 * The API does not boot through `bootstrapPillar` and has no live discovery
 * client. To feed the per-pillar `findSettingsManifest(await discoverSettings({
 * discovery }), '<id>')` lookup at each backend module-manifest call site
 * (`apps/pops-api/src/modules/<pillar>/index.ts`), this helper synthesises
 * a `PillarSnapshot[]` from the build-time `MODULES` registry that PRD-101
 * US-02 already exposes here. Each entry that carries a `settings` tuple
 * becomes one synthetic snapshot whose manifest payload declares the
 * settings dimension PRD-240 US-01 added to the schema.
 *
 * Memoised so the six consumers share a single computed snapshot at boot.
 * Synthesised entries are never sent over the wire — the schema validator
 * is not invoked here; consumers only read `manifest.settings.manifests`.
 *
 * When a pillar's snapshot is missing (e.g. gated out by `POPS_APPS` /
 * `POPS_OVERLAYS`), the consumer falls back to its own contract-package
 * descriptor; see the spec note on the `getOwnSettingsManifest()` pattern.
 */
import { MODULES } from '@pops/module-registry';

import type { PillarSnapshot } from '@pops/pillar-sdk/discovery';
import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';
import type { SettingsManifest } from '@pops/types';

let cached: readonly PillarSnapshot[] | undefined;

function buildManifestPayload(
  pillarId: string,
  version: string,
  settings: readonly SettingsManifest[]
): ManifestPayload {
  return {
    pillar: pillarId,
    version,
    contract: {
      package: `@pops/${pillarId}-contract`,
      version,
      tag: `contract-${pillarId}@v${version}`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    settings: { manifests: [...settings] },
    healthcheck: { path: '/health' },
  };
}

function hasSettings(m: (typeof MODULES)[number]): m is (typeof MODULES)[number] & {
  settings: readonly SettingsManifest[];
} {
  return 'settings' in m && m.settings !== undefined && m.settings.length > 0;
}

export function getLocalSettingsDiscoverySnapshot(): readonly PillarSnapshot[] {
  if (cached !== undefined) return cached;
  const snapshot: PillarSnapshot[] = [];
  for (const m of MODULES) {
    if (!hasSettings(m)) continue;
    snapshot.push({
      pillarId: m.id,
      baseUrl: `local://${m.id}`,
      manifest: buildManifestPayload(m.id, m.version, m.settings),
      registered: true,
      lastSeenAt: new Date(0),
    });
  }
  cached = snapshot;
  return cached;
}

export function __resetLocalSettingsDiscoverySnapshotCache(): void {
  cached = undefined;
}
