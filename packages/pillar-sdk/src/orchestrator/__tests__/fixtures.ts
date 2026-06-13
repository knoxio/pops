import type { PillarSnapshot } from '../../discovery/types.js';
import type { ManifestPayload } from '../../manifest-schema/schema.js';

export function manifest(pillarId: string, adapters: readonly string[]): ManifestPayload {
  return {
    pillar: pillarId,
    version: '1.0.0',
    contract: {
      package: `@pops/${pillarId}-contract`,
      version: '1.0.0',
      tag: `contract-${pillarId}@v1.0.0`,
    },
    routes: {
      queries: [`${pillarId}.routerA.list`],
      mutations: [`${pillarId}.routerA.create`],
      subscriptions: [],
    },
    search: {
      adapters: adapters.map((name) => ({
        name,
        entityType: 'entity',
        queryShape: {
          supportsText: true,
          supportsTags: false,
          supportsDateRange: false,
          supportsScope: [],
        },
        procedurePath: `${pillarId}.routerA.${name}`,
      })),
    },
    ai: { tools: [] },
    uri: { types: [`${pillarId}/entity`] },
    settings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}

export function snapshot(
  pillarId: string,
  adapters: readonly string[],
  registered = true
): PillarSnapshot {
  return {
    pillarId,
    baseUrl: `https://${pillarId}.test`,
    manifest: manifest(pillarId, adapters),
    registered,
    lastSeenAt: new Date('2026-01-01T00:00:00Z'),
  };
}
