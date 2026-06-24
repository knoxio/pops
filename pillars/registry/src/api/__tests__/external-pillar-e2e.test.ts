/**
 * End-to-end test that proves dynamic pillar discovery + callDynamic
 * closes the loop for an external pillar (dynamic-pillar-registration).
 *
 * The test does not stub the consumer SDK nor the registry. It boots:
 *
 *   1. the registry pillar against a temp-dir core.db on an ephemeral port —
 *      the surface that owns `POST /core.registry.register`,
 *      `POST /core.registry.deregister`, and `GET /core.registry.list`.
 *   2. A throwaway REST pillar on a second ephemeral port that serves an
 *      `/openapi` doc plus two operations — `echo.echo` and `echo.store` —
 *      the smallest surface that exercises both call kinds over the SDK's
 *      REST transport.
 *
 * It then drives the full lifecycle through HTTP:
 *
 *   register → callDynamic(query) → callDynamic(mutation) → deregister
 *   → callDynamic returns unavailable.
 *
 * The consumer side uses the real `pillar()` SDK from
 * `@pops/pillar-sdk/client`. Discovery points at the registry's
 * `core.registry.list`; the SDK then issues a direct HTTP POST to the
 * throwaway pillar's `baseUrl`. The discovery cache is set to TTL 0 so
 * the deregister assertion sees the updated snapshot without waiting for
 * the default 60s expiry.
 *
 * Acceptance criteria:
 *   - The throwaway pillar registers via `/core.registry.register`.
 *   - `core.registry.list` reports the pillar; the underlying DB row
 *     carries `origin: 'external'`.
 *   - `pillar(id).callDynamic('echo', 'echo', { value: 'ping' }, 'query')`
 *     resolves to `{ value: 'ping' }`.
 *   - `pillar(id).callDynamic('echo', 'store', { key, value }, 'mutation')`
 *     resolves to `{ ok: true }`.
 *   - `/core.registry.deregister` returns `{ ok: true, removed: true }`
 *     and the row is gone.
 *   - A subsequent `callDynamic` resolves to the `unavailable` failure
 *     shape — deregister removes the row, so the SDK's `guardAvailability`
 *     trips once discovery refreshes.
 *
 * The pillar id is `echotest` (no digits, no hyphens). The manifest
 * schema constrains procedure paths to `<pillar>.<router>.<procedure>`
 * where the pillar segment matches `[a-z][a-z0-9]*` (no hyphens), and
 * the contract-package field to `@pops/[a-z-]+-contract` (no digits).
 * `echotest` is the smallest id that satisfies both regexes.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __resetSharedPillarClient,
  HttpDiscoveryTransport,
  pillar,
  type PillarHandle,
} from '@pops/pillar-sdk/client';

import { openCoreDb, pillarRegistryService, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';

import type { AddressInfo } from 'node:net';

import type { ManifestPayload } from '@pops/pillar-sdk';

const PILLAR_ID = 'echotest';

function echoManifest(): ManifestPayload {
  return {
    pillar: PILLAR_ID,
    version: '0.1.0',
    contract: {
      package: `@pops/${PILLAR_ID}-contract`,
      version: '0.1.0',
      tag: `contract-${PILLAR_ID}@v0.1.0`,
    },
    routes: {
      queries: [`${PILLAR_ID}.echo.echo`],
      mutations: [`${PILLAR_ID}.echo.store`],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}

interface RecordedCall {
  readonly path: string;
  readonly input: unknown;
}

interface ThrowawayPillar {
  readonly baseUrl: string;
  readonly calls: readonly RecordedCall[];
  close(): Promise<void>;
}

/**
 * Boot a minimal REST HTTP server that answers the two procedures this test
 * calls. It serves an `/openapi` document plus two POST routes; the
 * SDK's REST transport sends `JSON.stringify(input)` as the raw body and
 * reads the value back verbatim, so the server speaks that wire shape
 * directly without a framework — keeping the test focused on the registry +
 * `callDynamic` path rather than transport wiring.
 *
 * The pillar is in-process and bound to a free TCP port via `listen(0)` so
 * it tears down cleanly with no leaked sockets in CI.
 */
async function startThrowawayPillar(): Promise<ThrowawayPillar> {
  const calls: RecordedCall[] = [];

  const server = createServer((req, res) => {
    void handleRequest(req, res, calls).catch((err: unknown) => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            message: err instanceof Error ? err.message : 'unknown error',
          })
        );
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    calls,
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw.length === 0) return null;
  return JSON.parse(raw);
}

/**
 * Minimal OpenAPI doc so the consumer SDK builds a REST route map for the
 * throwaway pillar (operationId `<router>.<proc>`, concatenated-path style).
 * Both procedures are POST-with-body, so the SDK ships `input` as the JSON body.
 */
const THROWAWAY_OPENAPI = {
  openapi: '3.0.0',
  info: { title: PILLAR_ID, version: '0.1.0' },
  paths: {
    '/echo/echo': {
      post: {
        operationId: 'echo.echo',
        requestBody: { content: { 'application/json': {} } },
        responses: { '200': { description: 'ok' } },
      },
    },
    '/echo/store': {
      post: {
        operationId: 'echo.store',
        requestBody: { content: { 'application/json': {} } },
        responses: { '200': { description: 'ok' } },
      },
    },
  },
};

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  calls: RecordedCall[]
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/health' && req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true, status: 'healthy', pillar: PILLAR_ID }));
    return;
  }
  if (url.pathname === '/openapi' && req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(THROWAWAY_OPENAPI));
    return;
  }
  if (req.method === 'POST' && (url.pathname === '/echo/echo' || url.pathname === '/echo/store')) {
    const input = await readJsonBody(req);
    calls.push({ path: url.pathname, input });
    const data = runProcedure(url.pathname, input);
    if (data === undefined) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ message: `bad input for ${url.pathname}` }));
      return;
    }
    // REST handlers return the value directly — no tRPC `{ result: { data } }` envelope.
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
    return;
  }
  res.statusCode = 404;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ message: 'unknown path' }));
}

function runProcedure(path: string, input: unknown): unknown | undefined {
  if (path === '/echo/echo') {
    if (isRecord(input) && typeof input.value === 'string') {
      return { value: input.value };
    }
    return undefined;
  }
  if (path === '/echo/store') {
    if (isRecord(input) && typeof input.key === 'string' && typeof input.value === 'string') {
      return { ok: true };
    }
    return undefined;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface E2eEnv {
  readonly tmpDir: string;
  readonly coreDb: OpenedCoreDb;
  readonly coreApiServer: Server;
  readonly coreApiBaseUrl: string;
  readonly throwaway: ThrowawayPillar;
}

let env: E2eEnv | undefined;

beforeEach(async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'prd-242-us-04-'));
  const coreDb = openCoreDb(join(tmpDir, 'core.db'));

  const app = createCoreApiApp({
    coreDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:0',
  });
  const coreApiServer = createServer(app);
  await new Promise<void>((resolve) => coreApiServer.listen(0, '127.0.0.1', resolve));
  const addr = coreApiServer.address() as AddressInfo;
  const coreApiBaseUrl = `http://127.0.0.1:${addr.port}`;

  const throwaway = await startThrowawayPillar();

  env = { tmpDir, coreDb, coreApiServer, coreApiBaseUrl, throwaway };

  __resetSharedPillarClient();
});

afterEach(async () => {
  __resetSharedPillarClient();
  // Defensive: beforeEach may have thrown before env was fully populated.
  // Each step independently catches so a failure mid-cleanup doesn't mask
  // the original setup error or leak the remaining resources.
  try {
    await env?.throwaway?.close();
  } catch {
    // noop — best-effort cleanup
  }
  try {
    if (env?.coreApiServer) {
      await new Promise<void>((resolve, reject) =>
        env.coreApiServer.close((err) => (err ? reject(err) : resolve()))
      );
    }
  } catch {
    // noop
  }
  try {
    env?.coreDb?.raw.close();
  } catch {
    // noop
  }
  try {
    if (env?.tmpDir) rmSync(env.tmpDir, { recursive: true, force: true });
  } catch {
    // noop
  }
});

function makePillarHandle(coreApiBaseUrl: string): PillarHandle<unknown> {
  const transport = new HttpDiscoveryTransport({ registryUrl: coreApiBaseUrl });
  return pillar<unknown>(PILLAR_ID, { transport, cacheTtlMs: 0 });
}

describe('external pillar register + callDynamic + deregister', () => {
  it('registers an external pillar, calls both procedure kinds via callDynamic, then deregisters', async () => {
    const registration = await request(env.coreApiBaseUrl).post('/core.registry.register').send({
      pillarId: PILLAR_ID,
      baseUrl: env.throwaway.baseUrl,
      manifest: echoManifest(),
    });
    expect(registration.status, JSON.stringify(registration.body)).toBe(200);
    expect(registration.body).toMatchObject({
      ok: true,
      pillarId: PILLAR_ID,
    });

    const persisted = pillarRegistryService.getPillarRegistration(env.coreDb.db, PILLAR_ID);
    expect(persisted).not.toBeNull();
    expect(persisted?.origin).toBe('external');
    expect(persisted?.status).toBe('healthy');
    expect(persisted?.baseUrl).toBe(env.throwaway.baseUrl);

    const snapshot = await request(env.coreApiBaseUrl).get('/core.registry.list');
    expect(snapshot.status).toBe(200);
    const snapshotPillars = snapshot.body?.pillars as
      | Array<{ pillarId: string; baseUrl: string }>
      | undefined;
    expect(Array.isArray(snapshotPillars)).toBe(true);
    expect(snapshotPillars?.find((p) => p.pillarId === PILLAR_ID)).toMatchObject({
      pillarId: PILLAR_ID,
      baseUrl: env.throwaway.baseUrl,
    });

    const handle = makePillarHandle(env.coreApiBaseUrl);

    const queryResult = await handle.callDynamic('echo', 'echo', { value: 'ping' }, 'query');
    expect(queryResult.kind).toBe('ok');
    if (queryResult.kind === 'ok') {
      expect(queryResult.value).toEqual({ value: 'ping' });
    }

    const mutationResult = await handle.callDynamic(
      'echo',
      'store',
      { key: 'k', value: 'v' },
      'mutation'
    );
    expect(mutationResult.kind).toBe('ok');
    if (mutationResult.kind === 'ok') {
      expect(mutationResult.value).toEqual({ ok: true });
    }

    expect(env.throwaway.calls).toEqual([
      { path: '/echo/echo', input: { value: 'ping' } },
      { path: '/echo/store', input: { key: 'k', value: 'v' } },
    ]);

    const dereg = await request(env.coreApiBaseUrl).post('/core.registry.deregister').send({
      pillarId: PILLAR_ID,
    });
    expect(dereg.status).toBe(200);
    expect(dereg.body).toMatchObject({ ok: true, removed: true });
    expect(pillarRegistryService.getPillarRegistration(env.coreDb.db, PILLAR_ID)).toBeNull();

    const afterDereg = await handle.callDynamic('echo', 'echo', { value: 'ping' }, 'query');
    expect(afterDereg.kind).toBe('unavailable');
    if (afterDereg.kind === 'unavailable') {
      expect(afterDereg.pillar).toBe(PILLAR_ID);
    }

    expect(env.throwaway.calls).toHaveLength(2);
  });
});
