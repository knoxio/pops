/**
 * End-to-end integration test for the read-only
 * `pillar('cerebrum').embeddings.*` cross-pillar SDK surface
 * (PRD-249 US-04).
 *
 * Boots a real `pops-cerebrum-api` Express app over loopback, seeds the
 * cerebrum `embeddings` table directly, then drives
 * `pillar('cerebrum').embeddings.{getStatus,listSourceIdsByType}` through
 * the server-side SDK from this test process (the same surface
 * `apps/pops-api/src/modules/core/embeddings/service.ts` consumes after
 * the PRD-249 US-03 flip). Proves:
 *
 *   - Transport + auth + contract round-trip for `getStatus()` (no
 *     filter, known filter, unknown filter).
 *   - Round-trip for `listSourceIdsByType()` with known + unknown
 *     source types.
 *   - The unavailable-pillar discriminant surfaces as `PillarCallError`
 *     with `cause.kind === 'unavailable'` when the registry marks the
 *     cerebrum-api as down.
 *
 * Implementation notes:
 *   - The discovery transport is an in-process stub — the test never
 *     binds the core registry container, just hands the SDK the
 *     cerebrum-api base URL directly.
 *   - The pillar SDK posts to `/trpc/<path>`. tRPC 11's HTTP adapter
 *     refuses POST for `.query(...)` procedures (405 METHOD_NOT_SUPPORTED).
 *     A test-only fetch impl rewrites the SDK's POST into a GET with an
 *     input query string so the read-only surface is exercised
 *     end-to-end without changing production SDK semantics (consumers
 *     using `.orThrow()` get the same wire response on both verbs).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { embeddings, openCerebrumDb, type OpenedCerebrumDb } from '@pops/cerebrum-db';
import { openCoreDb, serviceAccountsService, type OpenedCoreDb } from '@pops/core-db';
import { PillarCallError } from '@pops/pillar-sdk/client';
import { configureServerSdk, pillar, __resetServerPillarCache } from '@pops/pillar-sdk/server';

import { createCerebrumApiApp } from '../app.js';

import type { AddressInfo } from 'node:net';

import type { DiscoveredPillar, DiscoveryTransport } from '@pops/pillar-sdk/client';
import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

type CerebrumEmbeddingsShape = {
  embeddings: {
    getStatus: (input: { sourceType?: string }) => unknown;
    listSourceIdsByType: (input: { sourceType: string }) => unknown;
  };
};

interface Env {
  tmpDir: string;
  cerebrumDb: OpenedCerebrumDb;
  coreDb: OpenedCoreDb;
  cerebrumBaseUrl: string;
  closeServer: () => Promise<void>;
}

let env: Env;

function makeManifest(): ManifestPayload {
  return {
    pillar: 'cerebrum',
    version: '1.0.0',
    contract: {
      package: '@pops/cerebrum-contract',
      version: '1.0.0',
      tag: 'contract-cerebrum@v1.0.0',
    },
    routes: {
      queries: ['cerebrum.embeddings.getStatus', 'cerebrum.embeddings.listSourceIdsByType'],
      mutations: [],
      subscriptions: [],
    },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    sinks: [],
    search: { adapters: [] },
  } as unknown as ManifestPayload;
}

function makeDiscoveryTransport(snapshot: DiscoveredPillar[]): DiscoveryTransport {
  return {
    fetchSnapshot: () => Promise.resolve(snapshot),
  };
}

function extractBodyText(body: RequestInit['body']): string {
  if (typeof body === 'string') return body;
  if (body === null || body === undefined) return 'null';
  return '{}';
}

/**
 * Test-only fetch impl: tRPC 11's HTTP adapter rejects POST against
 * `.query(...)` procedures. The pillar SDK always posts; rewrite the
 * outbound request to a GET with the input as a query string so the
 * read-only surface is exercised over the wire without forking the SDK.
 * tRPC's response envelope is identical between the two verbs.
 */
function makeQueryRewriteFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init?.method !== 'POST') return fetch(input, init);
    const urlString = typeof input === 'string' ? input : input.toString();
    if (!urlString.includes('/trpc/')) return fetch(input, init);
    const bodyText = extractBodyText(init.body);
    const rewrittenUrl = `${urlString}?input=${encodeURIComponent(bodyText)}`;
    const headers = new Headers(init.headers);
    headers.delete('content-type');
    headers.delete('content-length');
    return fetch(rewrittenUrl, {
      method: 'GET',
      headers,
    });
  };
}

beforeAll(async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'embeddings-sdk-itest-'));
  const cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
  const coreDb = openCoreDb(join(tmpDir, 'core.db'));

  const sa = await serviceAccountsService.createServiceAccount(
    coreDb.db,
    { name: 'embeddings-sdk-itest', scopes: ['cerebrum'] },
    null
  );

  const app = createCerebrumApiApp({ cerebrumDb, coreDb, version: 'itest' });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const cerebrumBaseUrl = `http://127.0.0.1:${port}`;

  const now = new Date().toISOString();
  const seeds: Array<{ sourceType: string; sourceId: string; chunkIndex: number }> = [
    ...Array.from({ length: 3 }, (_, i) => ({
      sourceType: 'entity',
      sourceId: `e-${i + 1}`,
      chunkIndex: 0,
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      sourceType: 'transaction',
      sourceId: `t-${i + 1}`,
      chunkIndex: 0,
    })),
    // a second chunk for one entity to prove `selectDistinct` collapses it
    { sourceType: 'entity', sourceId: 'e-1', chunkIndex: 1 },
  ];
  for (const seed of seeds) {
    cerebrumDb.db
      .insert(embeddings)
      .values({
        sourceType: seed.sourceType,
        sourceId: seed.sourceId,
        chunkIndex: seed.chunkIndex,
        contentHash: `hash-${seed.sourceType}-${seed.sourceId}-${seed.chunkIndex}`,
        contentPreview: `preview-${seed.sourceId}-${seed.chunkIndex}`,
        model: 'itest-model',
        dimensions: 1536,
        createdAt: now,
      })
      .run();
  }

  __resetServerPillarCache();
  configureServerSdk({
    apiKey: sa.plaintextKey,
    cacheTtlMs: 0,
    fetchImpl: makeQueryRewriteFetch(),
  });

  env = {
    tmpDir,
    cerebrumDb,
    coreDb,
    cerebrumBaseUrl,
    closeServer: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
  };
});

afterAll(async () => {
  try {
    await env?.closeServer();
  } catch {
    // best-effort cleanup
  }
  try {
    env?.cerebrumDb.raw.close();
  } catch {
    // best-effort cleanup
  }
  try {
    env?.coreDb.raw.close();
  } catch {
    // best-effort cleanup
  }
  try {
    if (env?.tmpDir) rmSync(env.tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
  __resetServerPillarCache();
});

function healthyHandle(): ReturnType<typeof pillar<CerebrumEmbeddingsShape>> {
  const snapshot: DiscoveredPillar[] = [
    {
      pillarId: 'cerebrum',
      baseUrl: env.cerebrumBaseUrl,
      status: 'healthy',
      manifest: makeManifest(),
      lastSeenAt: new Date().toISOString(),
      registered: true,
    },
  ];
  return pillar<CerebrumEmbeddingsShape>('cerebrum', {
    transport: makeDiscoveryTransport(snapshot),
    cacheTtlMs: 0,
  });
}

describe("PRD-249 US-04 — pillar('cerebrum').embeddings.* round trip", () => {
  it('returns the total count across all source types when no filter is given', async () => {
    const result = await healthyHandle().embeddings.getStatus.orThrow({});
    expect(result).toEqual({ total: 9, pending: 0, stale: 0 });
  });

  it('returns the filtered count for a known source type', async () => {
    const result = await healthyHandle().embeddings.getStatus.orThrow({ sourceType: 'entity' });
    expect(result).toEqual({ total: 4, pending: 0, stale: 0 });
  });

  it('returns zeros for an unknown source type', async () => {
    const result = await healthyHandle().embeddings.getStatus.orThrow({ sourceType: 'unknown' });
    expect(result).toEqual({ total: 0, pending: 0, stale: 0 });
  });

  it('returns the distinct source ids for a known type', async () => {
    const raw = await healthyHandle().embeddings.listSourceIdsByType.orThrow({
      sourceType: 'entity',
    });
    const result = raw as { sourceIds: string[] };
    expect(result.sourceIds.toSorted()).toEqual(['e-1', 'e-2', 'e-3']);
  });

  it('returns an empty list for an unknown type', async () => {
    const raw = await healthyHandle().embeddings.listSourceIdsByType.orThrow({
      sourceType: 'unknown',
    });
    const result = raw as { sourceIds: string[] };
    expect(result.sourceIds).toEqual([]);
  });
});

describe('PRD-249 US-04 — unavailable-pillar discriminant', () => {
  it('throws PillarCallError with kind: unavailable when registry marks cerebrum down', async () => {
    const downSnapshot: DiscoveredPillar[] = [
      {
        pillarId: 'cerebrum',
        baseUrl: env.cerebrumBaseUrl,
        status: 'unavailable',
        manifest: makeManifest(),
        lastSeenAt: new Date().toISOString(),
        registered: true,
      },
    ];
    const handle = pillar<CerebrumEmbeddingsShape>('cerebrum', {
      transport: makeDiscoveryTransport(downSnapshot),
      cacheTtlMs: 0,
    });

    let caught: unknown;
    try {
      await handle.embeddings.getStatus.orThrow({});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PillarCallError);
    const callError = caught as PillarCallError;
    expect(callError.result.kind).toBe('unavailable');
    if (callError.result.kind === 'unavailable') {
      expect(callError.result.pillar).toBe('cerebrum');
    }
  });
});
