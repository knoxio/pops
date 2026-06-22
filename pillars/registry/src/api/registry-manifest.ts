/**
 * Hand-rolled registry pillar manifest payload (the pillar formerly named
 * `core`).
 *
 * Lives in its own module (rather than inline in `server.ts`) so tests can
 * import the builder without triggering the boot side-effects that
 * `server.ts` runs at module top-level (`openCoreDb`, `app.listen`,
 * signal handlers).
 *
 * PRD-243 US-02: the registry is backend-only and intentionally omits the
 * optional `nav` and `pages` UI dimensions. The shell-side aggregator
 * skips backend-only pillars when walking the registry for app-rail
 * entries and routes.
 *
 * The `routes` identifiers (`core.registry.*`, `core.serviceAccounts.*`) and
 * the `core.*` settings/feature keys are the wire/settings namespace owned by
 * the registry-path and settings plans, not this rename — they stay
 * byte-identical so the live register/heartbeat/discovery handshake is
 * unaffected by the pillar-identity rename.
 */
import { coreOperationalManifest } from '../contract/settings/index.js';

import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

export function buildRegistryManifest(version: string): ManifestPayload {
  return {
    pillar: 'registry',
    version,
    contract: {
      package: '@pops/registry-contract',
      version,
      tag: `contract-registry@v${version}`,
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
    settings: { manifests: [coreOperationalManifest] },
    features: [
      {
        key: 'core.redis',
        label: 'Redis',
        description:
          'Job queues and request cache. When unavailable, the API runs in degraded mode (queues + cache disabled).',
        default: true,
        scope: 'capability',
        capability: { pillar: 'registry', key: 'redis' },
        requiresEnv: ['REDIS_HOST'],
      },
    ],
    healthcheck: { path: '/health' },
  };
}
