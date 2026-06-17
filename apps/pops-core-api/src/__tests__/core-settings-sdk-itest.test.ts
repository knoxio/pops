/**
 * PRD-247 US-04 — end-to-end integration test for the
 * `pillar('core').settings.*` cross-pillar SDK surface.
 *
 * The test boots two real HTTP servers on ephemeral ports:
 *
 *   1. `pops-core-api` — the surface that owns `core.settings.*` per
 *      PRD-247 US-01. A service-account row is seeded in the same
 *      `core.db` so the protected procedures accept the `X-API-Key`
 *      header the server SDK attaches.
 *   2. A minimal Express server modelling the **pops-api side** —
 *      exposes a media-shaped handler at `POST /media/settings/*` that
 *      invokes `pillar('core').settings.{get, set, getMany}` against
 *      the booted core-api. The handler mirrors the shape the PRD-247
 *      US-03 burn-down lands at the Plex / arr / rotation call sites.
 *
 * Boot is gated on `POPS_INTERNAL_API_KEY` being set in the process
 * env, mirroring the production fail-closed semantics from
 * `packages/pillar-sdk/src/server/config.ts`. The test seeds the env
 * var with the plaintext service-account key issued at setup; the
 * original value is restored in teardown so other suites are not
 * affected.
 *
 * Four wire-level guarantees from PRD-247 US-04:
 *
 *   - `set` → `get` round-trips through the cross-pillar surface.
 *   - `getMany([k1, k2, k3])` returns `{ k1: v1, k2: v2 }` when only
 *     `k1` and `k2` have been set. Missing keys are omitted from the
 *     response — they are not `null`-valued.
 *   - The per-`pillarId` discovery cache resolves the registry once per
 *     TTL window; back-to-back procedure calls do exactly one snapshot
 *     fetch. A counting `DiscoveryTransport` is the spy.
 *   - On core-api shutdown, the next procedure call surfaces as a
 *     `PillarCallError` with `result.kind === 'unavailable'` at the
 *     media-shaped handler.
 *
 * The single-key procedures constrain `key` to `SETTINGS_KEY_VALUES`,
 * so the test uses the real Plex keys (`PLEX_URL`, `PLEX_TOKEN`,
 * `PLEX_USERNAME`, `PLEX_ENCRYPTION_SEED`) the audit calls out as the
 * dominant hot-path consumers — no need to widen the enum for the test.
 *
 * The pillar SDK's HTTP-call helper always POSTs to `/trpc/<path>`.
 * tRPC 11's HTTP adapter refuses POST against `.query(...)` procedures
 * and answers `405 METHOD_NOT_SUPPORTED`. A test-only `fetch` impl
 * rewrites POSTs against the known query-shaped paths into GETs with
 * the input encoded as `?input=…`. The tRPC envelope is identical on
 * both verbs, so the SDK reads `{ result: { data } }` either way.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import express, { type Express, type Request, type Response } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openCoreDb, serviceAccountsService, type OpenedCoreDb } from '@pops/core-db';
import {
  __resetServerPillarCache,
  __resetServerSdkConfig,
  configureServerSdk,
  pillar,
  PillarCallError,
  PillarServerSdkError,
  type DiscoveredPillar,
  type DiscoveryTransport,
} from '@pops/pillar-sdk/server';
import { SETTINGS_KEYS } from '@pops/types';

import { createCoreApiApp } from '../app.js';

import type { AddressInfo } from 'node:net';

import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

const INTERNAL_API_KEY_ENV = 'POPS_INTERNAL_API_KEY';

interface CoreSettingsShape {
  settings: {
    get: (input: { key: string }) => { data: { key: string; value: string } | null };
    set: (input: { key: string; value: string }) => {
      data: { key: string; value: string };
      message: string;
    };
    getMany: (input: { keys: string[] }) => { settings: Record<string, string> };
  };
}

function buildCoreManifest(): ManifestPayload {
  return {
    pillar: 'core',
    version: '0.0.1-itest',
    contract: {
      package: '@pops/core-contract',
      version: '0.0.1-itest',
      tag: 'contract-core@v0.0.1-itest',
    },
    routes: {
      queries: ['core.settings.get', 'core.settings.getMany'],
      mutations: ['core.settings.set'],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}

function listenOnEphemeralPort(app: Express): Promise<Server> {
  const server = createServer(app);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function baseUrlOf(server: Server): string {
  const addr = server.address() as AddressInfo;
  return `http://127.0.0.1:${addr.port}`;
}

/**
 * Counting `DiscoveryTransport`. Wraps a fixed snapshot and tracks every
 * call to `fetchSnapshot()` so the test can assert the SDK reuses the
 * cached handle across back-to-back procedure calls.
 */
class CountingDiscoveryTransport implements DiscoveryTransport {
  fetchCount = 0;

  constructor(private readonly snapshot: readonly DiscoveredPillar[]) {}

  fetchSnapshot(): Promise<readonly DiscoveredPillar[]> {
    this.fetchCount += 1;
    return Promise.resolve(this.snapshot);
  }
}

/**
 * Test-only `fetch` impl: tRPC 11's HTTP adapter rejects POST against
 * `.query(...)` procedures. The SDK posts unconditionally — rewrite
 * the outbound request to a GET with the input encoded as a query
 * string so the read-only surface is exercised over the wire without
 * forking the SDK.
 */
function makeQueryRewriteFetch(queryPathFragments: readonly string[]): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init?.method !== 'POST') return fetch(input, init);
    const urlString = typeof input === 'string' ? input : input.toString();
    if (!urlString.includes('/trpc/')) return fetch(input, init);
    const isQuery = queryPathFragments.some((frag) => urlString.includes(frag));
    if (!isQuery) return fetch(input, init);

    const bodyText = ((): string => {
      const body = init.body;
      if (typeof body === 'string') return body;
      if (body === null || body === undefined) return 'null';
      return '{}';
    })();
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

interface MediaHandlerDeps {
  readonly transport: CountingDiscoveryTransport;
}

/**
 * Minimal media-shaped Express app. Each route mirrors the shape the
 * PRD-247 US-03 burn-down lands at the production media call sites —
 * `await pillar('core').settings.<m>(...)` inside an Express handler.
 */
function createMediaHandlerApp(deps: MediaHandlerDeps): Express {
  const app = express();
  app.use(express.json());

  const handle = (): ReturnType<typeof pillar<CoreSettingsShape>> =>
    pillar<CoreSettingsShape>('core', { transport: deps.transport });

  app.post('/media/settings/set', (req: Request, res: Response): void => {
    const { key, value } = req.body as { key: string; value: string };
    handle()
      .settings.set.orThrow({ key, value })
      .then((data) => res.json({ ok: true, data }))
      .catch((err: unknown) => sendCallError(res, err));
  });

  app.post('/media/settings/get', (req: Request, res: Response): void => {
    const { key } = req.body as { key: string };
    handle()
      .settings.get.orThrow({ key })
      .then((data) => res.json({ ok: true, data }))
      .catch((err: unknown) => sendCallError(res, err));
  });

  app.post('/media/settings/getMany', (req: Request, res: Response): void => {
    const { keys } = req.body as { keys: string[] };
    handle()
      .settings.getMany.orThrow({ keys })
      .then((data) => res.json({ ok: true, data }))
      .catch((err: unknown) => sendCallError(res, err));
  });

  return app;
}

function sendCallError(res: Response, err: unknown): void {
  if (err instanceof PillarCallError) {
    res.status(503).json({
      ok: false,
      error: 'pillar-call-error',
      kind: err.result.kind,
      pillarId: err.pillarId,
    });
    return;
  }
  if (err instanceof PillarServerSdkError) {
    res.status(500).json({ ok: false, error: 'pillar-server-sdk-error', message: err.message });
    return;
  }
  res.status(500).json({
    ok: false,
    error: 'unknown',
    message: err instanceof Error ? err.message : String(err),
  });
}

interface IntegrationEnv {
  readonly tmpDir: string;
  readonly coreDb: OpenedCoreDb;
  readonly coreApiServer: Server;
  readonly coreApiBaseUrl: string;
  readonly popsApiServer: Server;
  readonly popsApiBaseUrl: string;
  readonly transport: CountingDiscoveryTransport;
  readonly originalApiKeyEnv: string | undefined;
}

let env: IntegrationEnv;

beforeAll(async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'prd-247-us-04-'));
  const coreDb = openCoreDb(join(tmpDir, 'core.db'));

  const sa = await serviceAccountsService.createServiceAccount(
    coreDb.db,
    { name: 'prd-247-us-04-itest', scopes: ['core'] },
    null
  );

  const originalApiKeyEnv = process.env[INTERNAL_API_KEY_ENV];
  process.env[INTERNAL_API_KEY_ENV] = sa.plaintextKey;

  const coreApiApp = createCoreApiApp({
    coreDb,
    version: '0.0.1-itest',
    selfBaseUrl: 'http://127.0.0.1:0',
  });
  const coreApiServer = await listenOnEphemeralPort(coreApiApp);
  const coreApiBaseUrl = baseUrlOf(coreApiServer);

  const snapshot: DiscoveredPillar[] = [
    {
      pillarId: 'core',
      baseUrl: coreApiBaseUrl,
      status: 'healthy',
      manifest: buildCoreManifest(),
      lastSeenAt: new Date().toISOString(),
      registered: true,
    },
  ];
  const transport = new CountingDiscoveryTransport(snapshot);

  __resetServerPillarCache();
  __resetServerSdkConfig();
  configureServerSdk({
    apiKey: sa.plaintextKey,
    fetchImpl: makeQueryRewriteFetch(['core.settings.get', 'core.settings.getMany']),
  });

  const popsApiApp = createMediaHandlerApp({ transport });
  const popsApiServer = await listenOnEphemeralPort(popsApiApp);
  const popsApiBaseUrl = baseUrlOf(popsApiServer);

  env = {
    tmpDir,
    coreDb,
    coreApiServer,
    coreApiBaseUrl,
    popsApiServer,
    popsApiBaseUrl,
    transport,
    originalApiKeyEnv,
  };
});

afterAll(async () => {
  try {
    await closeServer(env.popsApiServer);
  } catch {
    // best-effort cleanup
  }
  try {
    await closeServer(env.coreApiServer);
  } catch {
    // best-effort cleanup — the shutdown-discriminant test may have
    // already taken the core-api server down.
  }
  try {
    env.coreDb.raw.close();
  } catch {
    // best-effort cleanup
  }
  try {
    rmSync(env.tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
  if (env.originalApiKeyEnv === undefined) {
    delete process.env[INTERNAL_API_KEY_ENV];
  } else {
    process.env[INTERNAL_API_KEY_ENV] = env.originalApiKeyEnv;
  }
  __resetServerPillarCache();
  __resetServerSdkConfig();
});

interface MediaResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
  kind?: string;
  pillarId?: string;
}

async function callMedia(
  path: string,
  body: unknown
): Promise<{ status: number; body: MediaResponse }> {
  const res = await fetch(`${env.popsApiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as MediaResponse;
  return { status: res.status, body: json };
}

describe("PRD-247 US-04 — pillar('core').settings.* end-to-end", () => {
  it('round-trips a single key through set + get from a media-shaped handler', async () => {
    const setRes = await callMedia('/media/settings/set', {
      key: SETTINGS_KEYS.PLEX_URL,
      value: 'http://plex.example.com:32400',
    });
    expect(setRes.status, JSON.stringify(setRes.body)).toBe(200);
    expect(setRes.body).toMatchObject({
      ok: true,
      data: {
        data: { key: SETTINGS_KEYS.PLEX_URL, value: 'http://plex.example.com:32400' },
        message: 'Setting saved',
      },
    });

    const getRes = await callMedia('/media/settings/get', { key: SETTINGS_KEYS.PLEX_URL });
    expect(getRes.status, JSON.stringify(getRes.body)).toBe(200);
    expect(getRes.body).toMatchObject({
      ok: true,
      data: {
        data: { key: SETTINGS_KEYS.PLEX_URL, value: 'http://plex.example.com:32400' },
      },
    });
  });

  it('returns only the set keys from getMany; unset keys are omitted', async () => {
    await callMedia('/media/settings/set', {
      key: SETTINGS_KEYS.PLEX_TOKEN,
      value: 'token-abc',
    });
    await callMedia('/media/settings/set', {
      key: SETTINGS_KEYS.PLEX_USERNAME,
      value: 'jdoe',
    });

    const res = await callMedia('/media/settings/getMany', {
      keys: [
        SETTINGS_KEYS.PLEX_TOKEN,
        SETTINGS_KEYS.PLEX_USERNAME,
        SETTINGS_KEYS.PLEX_ENCRYPTION_SEED,
      ],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.ok).toBe(true);
    const settings = (res.body.data as { settings: Record<string, string> }).settings;
    expect(settings[SETTINGS_KEYS.PLEX_TOKEN]).toBe('token-abc');
    expect(settings[SETTINGS_KEYS.PLEX_USERNAME]).toBe('jdoe');
    expect(SETTINGS_KEYS.PLEX_ENCRYPTION_SEED in settings).toBe(false);
  });

  it('resolves the discovery snapshot exactly once across back-to-back procedure calls', async () => {
    const before = env.transport.fetchCount;
    expect(before).toBeGreaterThan(0);

    for (let i = 0; i < 4; i += 1) {
      const res = await callMedia('/media/settings/get', { key: SETTINGS_KEYS.PLEX_URL });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }

    expect(env.transport.fetchCount).toBe(before);
  });
});

describe('PRD-247 US-04 — unavailable-pillar discriminant on core-api shutdown', () => {
  it("surfaces PillarCallError with kind: 'unavailable' once core-api is taken down", async () => {
    await closeServer(env.coreApiServer);

    const res = await callMedia('/media/settings/get', { key: SETTINGS_KEYS.PLEX_URL });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      ok: false,
      error: 'pillar-call-error',
      kind: 'unavailable',
      pillarId: 'core',
    });
  });
});
