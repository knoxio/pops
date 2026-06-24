/**
 * End-to-end integration test for the `pillar('core').settings.*`
 * cross-pillar SDK surface (settings-as-manifest-dimension).
 *
 * The test boots two real HTTP servers on ephemeral ports:
 *
 *   1. The registry pillar — the surface that owns `core.settings.*`. A
 *      service-account row is seeded in the same `core.db` so the protected
 *      procedures accept the `X-API-Key` header the server SDK attaches.
 *   2. A minimal Express server modelling a consumer pillar — exposes a
 *      media-shaped handler at `POST /media/settings/*` that invokes
 *      `pillar('core').settings.{get, set, getMany}` against the booted
 *      registry, mirroring the shape a production call site uses.
 *
 * Boot is gated on `POPS_INTERNAL_API_KEY` being set in the process
 * env, mirroring the production fail-closed semantics from the server SDK
 * config. The test seeds the env var with the plaintext service-account
 * key issued at setup; the original value is restored in teardown so other
 * suites are not affected.
 *
 * Wire-level guarantees:
 *
 *   - `set` → `get` round-trips through the cross-pillar surface.
 *   - `getMany([k1, k2, k3])` returns `{ k1: v1, k2: v2 }` when only
 *     `k1` and `k2` have been set. Missing keys are omitted from the
 *     response — they are not `null`-valued.
 *   - The per-`pillarId` discovery cache resolves the registry once per
 *     TTL window; back-to-back procedure calls do exactly one snapshot
 *     fetch. A counting `DiscoveryTransport` is the spy.
 *   - On registry shutdown, the next procedure call surfaces as a
 *     `PillarCallError` with `result.kind === 'unavailable'` at the
 *     media-shaped handler.
 *
 * The single-key procedures constrain `key` to the registry's own
 * manifest key set (derived from `coreOperationalManifest`), so this test
 * uses real `core.*` keys (`core.defaultLimit`, `core.search.showMoreLimit`,
 * `core.aiRetry.maxRetries`).
 *
 * The server SDK resolves `pillar('core').settings.*` over the REST
 * transport — it fetches the pillar's `/openapi`, builds the operationId
 * route map, and issues idiomatic REST requests (`GET /settings/:key`,
 * `POST /settings/get-many`, `PUT /settings/:key`). The media-shaped handler
 * therefore exercises the exact wire a production consumer uses.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import express, { type Express, type Request, type Response } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

import { openCoreDb, serviceAccountsService, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';

const CORE_DEFAULT_LIMIT = 'core.defaultLimit';
const CORE_SHOW_MORE_LIMIT = 'core.search.showMoreLimit';
const CORE_AI_RETRY_MAX_RETRIES = 'core.aiRetry.maxRetries';

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

interface MediaHandlerDeps {
  readonly transport: CountingDiscoveryTransport;
}

/**
 * Minimal media-shaped Express app. Each route mirrors a production media
 * call site — `await pillar('core').settings.<m>(...)` inside an Express
 * handler.
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
  configureServerSdk({ apiKey: sa.plaintextKey });

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
    // already taken the registry server down.
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

describe("pillar('core').settings.* end-to-end", () => {
  it('round-trips a single key through set + get from a media-shaped handler', async () => {
    const setRes = await callMedia('/media/settings/set', {
      key: CORE_DEFAULT_LIMIT,
      value: '125',
    });
    expect(setRes.status, JSON.stringify(setRes.body)).toBe(200);
    expect(setRes.body).toMatchObject({
      ok: true,
      data: {
        data: { key: CORE_DEFAULT_LIMIT, value: '125' },
        message: 'Setting saved',
      },
    });

    const getRes = await callMedia('/media/settings/get', { key: CORE_DEFAULT_LIMIT });
    expect(getRes.status, JSON.stringify(getRes.body)).toBe(200);
    expect(getRes.body).toMatchObject({
      ok: true,
      data: {
        data: { key: CORE_DEFAULT_LIMIT, value: '125' },
      },
    });
  });

  it('returns only the set keys from getMany; unset keys are omitted', async () => {
    await callMedia('/media/settings/set', {
      key: CORE_DEFAULT_LIMIT,
      value: '7',
    });
    await callMedia('/media/settings/set', {
      key: CORE_SHOW_MORE_LIMIT,
      value: '9',
    });

    const res = await callMedia('/media/settings/getMany', {
      keys: [CORE_DEFAULT_LIMIT, CORE_SHOW_MORE_LIMIT, CORE_AI_RETRY_MAX_RETRIES],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.ok).toBe(true);
    const settings = (res.body.data as { settings: Record<string, string> }).settings;
    expect(settings[CORE_DEFAULT_LIMIT]).toBe('7');
    expect(settings[CORE_SHOW_MORE_LIMIT]).toBe('9');
    expect(CORE_AI_RETRY_MAX_RETRIES in settings).toBe(false);
  });

  it('resolves the discovery snapshot exactly once across back-to-back procedure calls', async () => {
    const before = env.transport.fetchCount;
    expect(before).toBeGreaterThan(0);

    for (let i = 0; i < 4; i += 1) {
      const res = await callMedia('/media/settings/get', { key: CORE_DEFAULT_LIMIT });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }

    expect(env.transport.fetchCount).toBe(before);
  });
});

describe('unavailable-pillar discriminant on registry shutdown', () => {
  it("surfaces PillarCallError with kind: 'unavailable' once the registry is taken down", async () => {
    await closeServer(env.coreApiServer);

    const res = await callMedia('/media/settings/get', { key: CORE_DEFAULT_LIMIT });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      ok: false,
      error: 'pillar-call-error',
      kind: 'unavailable',
      pillarId: 'core',
    });
  });
});
