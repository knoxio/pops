export const FIXTURE_API_KEY = 'fixture-internal-api-key';
export const FIXTURE_PILLAR_ID = 'fixture';

/**
 * Build a manifest payload that satisfies `ManifestPayloadSchema` from
 * `@pops/pillar-sdk/manifest-schema`. Used by both the fixture's
 * `/manifest.json` endpoint and the registration handshake (WF-15).
 */
export function buildFixtureManifest(): Record<string, unknown> {
  return {
    pillar: FIXTURE_PILLAR_ID,
    version: '0.1.0',
    contract: {
      package: '@pops/fixture-contract',
      version: '0.1.0',
      tag: 'contract-fixture@v0.1.0',
    },
    routes: {
      queries: ['fixture.fixture.ping'],
      mutations: [],
      subscriptions: ['fixture.fixture.tick'],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}
