import { validManifest } from '../../__tests__/fixtures.js';

import type { RegistryFetchResult } from '../fetcher.js';
import type { PillarSnapshot } from '../types.js';

export function pillar(id: string, baseUrl: string, lastSeenAt = new Date()): PillarSnapshot {
  const base = validManifest();
  const manifest = {
    ...base,
    pillar: id,
    contract: {
      ...base.contract,
      package: `@pops/${id}-contract`,
      tag: `contract-${id}@v${base.contract.version}`,
    },
    routes: {
      queries: [`${id}.routerA.list`],
      mutations: [`${id}.routerA.create`],
      subscriptions: [],
    },
    uri: { types: [`${id}/entity`] },
    settings: { keys: [`${id}.defaultThing`] },
  };
  return {
    pillarId: id,
    baseUrl,
    manifest,
    registered: true,
    lastSeenAt,
  };
}

export function fetchResult(...pillars: PillarSnapshot[]): RegistryFetchResult {
  return { pillars, fetchedAt: new Date() };
}

/**
 * Build the registry-side wire payload as PRD-161 emits it from
 * `core.registry.list`. Tests that exercise the HTTP fetcher use
 * this to round-trip the schema.
 */
export function wirePayload(...pillars: PillarSnapshot[]): unknown {
  return {
    result: {
      data: {
        pillars: pillars.map((p) => ({
          pillarId: p.pillarId,
          baseUrl: p.baseUrl,
          manifest: p.manifest,
          lastSeenAt: p.lastSeenAt.toISOString(),
          registered: p.registered,
          status: 'healthy' as const,
        })),
        fetchedAt: new Date().toISOString(),
      },
    },
  };
}

export function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}
