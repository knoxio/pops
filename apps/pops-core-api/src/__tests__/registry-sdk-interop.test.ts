/**
 * Integration smoke for the SDK ↔ registry procedure-name contract
 * (PRD-227 precondition #1).
 *
 * The discovery SDK (`@pops/pillar-sdk`) historically called the
 * registry via `core.registry.snapshot` while the router exposed
 * `core.registry.list`, so any FE/MCP canary that asked the SDK to
 * fetch the snapshot got a 404. This test pins the URL contract
 * end-to-end:
 *
 *   1. Boot `createCoreApiApp` against a per-test file-backed core.db
 *      in an OS temp directory.
 *   2. Listen on an ephemeral port via `http.createServer(app).listen(0)`.
 *   3. Inject a tracing `fetchImpl` into `HttpDiscoveryTransport` to
 *      capture the URL the SDK constructs.
 *   4. Assert the URL is the raw `/core.registry.list` route and the HTTP
 *      transport's `fetch` returns a 200 with the bare snapshot body
 *      (`{ pillars, fetchedAt }` — no tRPC envelope), and that the SDK
 *      resolves it into `DiscoveredPillar[]`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '@pops/core-db';
import { HttpDiscoveryTransport } from '@pops/pillar-sdk/client';

import { createCoreApiApp } from '../app.js';
import { appRouter } from '../router.js';
import { type Context } from '../trpc.js';

import type { AddressInfo } from 'node:net';

import type { ManifestPayload } from '@pops/pillar-sdk';

let tmpDir: string;
let coreDb: OpenedCoreDb;
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-sdk-interop-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  const app = createCoreApiApp({
    coreDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:0',
  });
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

function caller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: { email: 'dev@example.com' },
    serviceAccount: null,
    coreDb: coreDb.db,
  };
  return appRouter.createCaller(ctx);
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

describe('SDK ↔ core.registry procedure-name interop', () => {
  it('HttpDiscoveryTransport hits /core.registry.list on the live server', async () => {
    await caller().core.registry.register({
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
    });

    const seenUrls: string[] = [];
    let lastResponse: Response | undefined;
    const tracingFetch: typeof fetch = async (input, init) => {
      const url = extractFetchUrl(input);
      seenUrls.push(url);
      const res = await fetch(input, init);
      lastResponse = res.clone();
      return res;
    };

    const transport = new HttpDiscoveryTransport({
      registryUrl: baseUrl,
      fetchImpl: tracingFetch,
    });

    const snapshot = await transport.fetchSnapshot();

    expect(seenUrls).toEqual([`${baseUrl}/core.registry.list`]);
    expect(lastResponse?.status).toBe(200);

    // Bare body — the raw snapshot route carries no tRPC `{ result: { data } }` envelope.
    const body = (await lastResponse?.json()) as { pillars: unknown[]; fetchedAt: string };
    expect(Array.isArray(body.pillars)).toBe(true);
    expect(body.pillars).toHaveLength(1);
    expect(typeof body.fetchedAt).toBe('string');
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.pillarId).toBe('finance');
  });

  it('returns an empty pillar list on a fresh registry (no 404)', async () => {
    const seenUrls: string[] = [];
    const tracingFetch: typeof fetch = async (input, init) => {
      const url = extractFetchUrl(input);
      seenUrls.push(url);
      return fetch(input, init);
    };

    const transport = new HttpDiscoveryTransport({
      registryUrl: baseUrl,
      fetchImpl: tracingFetch,
    });

    const snapshot = await transport.fetchSnapshot();

    expect(seenUrls).toEqual([`${baseUrl}/core.registry.list`]);
    expect(snapshot).toEqual([]);
  });
});
