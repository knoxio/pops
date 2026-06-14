import { cerebrumManifest, egoManifest } from '@pops/cerebrum-contract/settings';

import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

export const CEREBRUM_PILLAR_ID = 'cerebrum' as const;

/**
 * Cerebrum pillar manifest (PRD-240 US-03).
 *
 * Declares the `settings.manifests` dimension on the cerebrum API's
 * manifest payload — the cerebrum sub-domain (`cerebrumManifest`) and
 * the ego sub-domain (`egoManifest`) per ADR-026. Both descriptors are
 * sourced from the cerebrum contract package's `./settings` subpath, so
 * the pillar is the sole declarer of its settings UI contribution. See
 * [ADR-037](../../../../docs/architecture/adr-037-settings-as-manifest-dimension.md)
 * for the dimension's design and PRD-240 for the rollout plan.
 */
export function buildCerebrumManifest(version: string): ManifestPayload {
  return {
    pillar: CEREBRUM_PILLAR_ID,
    version,
    contract: {
      package: '@pops/cerebrum-contract',
      version,
      tag: `contract-cerebrum@v${version}`,
    },
    routes: {
      queries: ['cerebrum.nudges.list', 'cerebrum.nudges.get', 'cerebrum.nudges.contradictions'],
      mutations: ['cerebrum.nudges.dismiss'],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    settings: { manifests: [cerebrumManifest, egoManifest] },
    healthcheck: { path: '/health' },
  };
}
