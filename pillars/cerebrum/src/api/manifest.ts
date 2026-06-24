/**
 * Cerebrum pillar manifest payload builder.
 *
 * Hand-rolled (see `manifest-type-generation` for the contract-driven
 * generator). Declares the cerebrum + ego settings UI contributions under
 * `settings.manifests`.
 */
import { cerebrumManifest, egoManifest } from '../contract/settings/index.js';

import type { CapabilityReporter } from '@pops/pillar-sdk/bootstrap';
import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

/**
 * Runtime capability heartbeat for cerebrum. Reports the live
 * `cerebrum.vectorSearch` status (whether sqlite-vec loaded on this
 * connection) alongside `settings: true`, which advertises cerebrum's own
 * federated `/settings/*` surface so the shell routes settings reads/writes to
 * it (capability-gated) rather than falling back to the registry pillar.
 */
export function buildCerebrumCapabilityReporter(vecAvailable: boolean): CapabilityReporter {
  return () => ({ vectorSearch: vecAvailable, settings: true });
}

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
