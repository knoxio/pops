/**
 * Cerebrum pillar manifest payload builder.
 *
 * Hand-rolled until PRD-155 generates this from the contract. Declares the
 * cerebrum + ego settings UI contributions under `settings.manifests`. The
 * `nav`/`pages` UI dimensions are deferred to the FE-rewire slice (Phase D),
 * when `packages/app-cerebrum` + `packages/overlay-ego` repoint at the
 * pillar; until then the registry walk just sees the settings + healthcheck.
 */
import { cerebrumManifest, egoManifest } from '../contract/settings/index.js';

import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

export function buildCerebrumManifest(version: string): ManifestPayload {
  return {
    pillar: 'cerebrum',
    version,
    contract: {
      package: '@pops/cerebrum',
      version,
      tag: `contract-cerebrum@v${version}`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    settings: { manifests: [cerebrumManifest, egoManifest] },
    features: [
      {
        key: 'cerebrum.vectorSearch',
        label: 'Vector search (sqlite-vec)',
        description:
          'Semantic and hybrid retrieval. Disabled when the sqlite-vec extension fails to load at startup.',
        default: true,
        scope: 'capability',
        capability: { pillar: 'cerebrum', key: 'vectorSearch' },
      },
    ],
    healthcheck: { path: '/health' },
  };
}
