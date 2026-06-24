/**
 * Integration smoke for the SDK ↔ registry discovery contract
 * (discovery-client).
 *
 * Pins the discovery wire end-to-end: the pillar SDK's
 * `HttpDiscoveryTransport` must fetch the registry snapshot from the raw
 * `GET /core.registry.list` route and parse the bare
 * `{ pillars, fetchedAt }` body into `DiscoveredPillar[]`.
 *
 *   1. Boot `createCoreApiApp` against a per-test file-backed core.db.
 *   2. Listen on an ephemeral port via `http.createServer(app).listen(0)`.
 *   3. Seed a pillar via the raw register route.
 *   4. Inject a tracing `fetchImpl` into `HttpDiscoveryTransport` to capture
 *      the URL the SDK constructs, then assert it resolves the snapshot.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HttpDiscoveryTransport } from '@pops/pillar-sdk/client';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';

import type { AddressInfo } from 'node:net';

import type { ManifestPayload } from '@pops/pillar-sdk';

let tmpDir: string;
let coreDb: OpenedCoreDb;
let app: ReturnType<typeof createCoreApiApp>;
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-sdk-interop-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  app = createCoreApiApp({ coreDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:0' });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    ).catch(() => undefined);
  }
  if (coreDb) {
    try {
      coreDb.raw.close();
    } catch {
      // surface the original beforeEach failure instead of swallowing cleanup noise
    }
  }
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

function extractFetchUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
}

function financeManifest(): ManifestPayload {
  return {
    pillar: 'finance',
    version: '0.1.0',
    contract: {
      package: '@pops/finance-contract',
      version: '0.1.0',
      tag: 'contract-finance@v0.1.0',
    },
    routes: {
      queries: ['finance.transactions.list'],
      mutations: ['finance.transactions.create'],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: ['finance/transaction'] },
    consumedSettings: { keys: ['finance.defaultCurrency'] },
    healthcheck: { path: '/healthz' },
  };
}

async function registerFinance(): Promise<void> {
  const res = await request(app).post('/core.registry.register').send({
    pillarId: 'finance',
    baseUrl: 'http://finance-api:3004',
    manifest: financeManifest(),
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

describe('SDK ↔ core.registry discovery interop', () => {
  it('HttpDiscoveryTransport hits /registry/pillars (slash-first, no fallback) and resolves the snapshot', async () => {
    await registerFinance();

    const seenUrls: string[] = [];
    let lastResponse: Response | undefined;
    const tracingFetch: typeof fetch = async (input, init) => {
      seenUrls.push(extractFetchUrl(input));
      const res = await fetch(input, init);
      lastResponse = res.clone();
      return res;
    };

    const transport = new HttpDiscoveryTransport({ registryUrl: baseUrl, fetchImpl: tracingFetch });
    const snapshot = await transport.fetchSnapshot();

    // The canonical slash path resolves on the first request — no 404
    // fallback to the legacy dotted path.
    expect(seenUrls).toEqual([`${baseUrl}/registry/pillars`]);
    expect(lastResponse?.status).toBe(200);

    // Bare body — no tRPC `{ result: { data } }` envelope.
    const body = (await lastResponse?.json()) as { pillars: unknown[]; fetchedAt: string };
    expect(Array.isArray(body.pillars)).toBe(true);
    expect(typeof body.fetchedAt).toBe('string');
    expect('result' in (body as Record<string, unknown>)).toBe(false);

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.pillarId).toBe('finance');
    expect(snapshot[0]?.baseUrl).toBe('http://finance-api:3004');
  });

  it('returns an empty pillar list on a fresh registry (no 404)', async () => {
    const seenUrls: string[] = [];
    const tracingFetch: typeof fetch = async (input, init) => {
      seenUrls.push(extractFetchUrl(input));
      return fetch(input, init);
    };

    const transport = new HttpDiscoveryTransport({ registryUrl: baseUrl, fetchImpl: tracingFetch });
    const snapshot = await transport.fetchSnapshot();

    expect(seenUrls).toEqual([`${baseUrl}/registry/pillars`]);
    expect(snapshot).toEqual([]);
  });
});
