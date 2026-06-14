/**
 * Hand-rolled core pillar manifest payload.
 *
 * Lives in its own module (rather than inline in `server.ts`) so tests can
 * import the builder without triggering the boot side-effects that
 * `server.ts` runs at module top-level (`openCoreDb`, `app.listen`,
 * signal handlers).
 */
import { aiConfigManifest, coreOperationalManifest } from '@pops/core-contract/settings';

import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

export function buildCoreManifest(version: string): ManifestPayload {
  return {
    pillar: 'core',
    version,
    contract: {
      package: '@pops/core-contract',
      version,
      tag: `contract-core@v${version}`,
    },
    routes: {
      queries: ['core.registry.list', 'core.registry.get', 'core.serviceAccounts.list'],
      mutations: [
        'core.registry.register',
        'core.registry.deregister',
        'core.registry.heartbeat',
        'core.serviceAccounts.create',
        'core.serviceAccounts.revoke',
      ],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    settings: { manifests: [aiConfigManifest, coreOperationalManifest] },
    healthcheck: { path: '/health' },
  };
}
