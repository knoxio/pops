/**
 * Dual-serve integration for the registry handshake/discovery routes
 * (registry-cleanup Phase 1).
 *
 * Core mounts each registry operation on BOTH its canonical slash path
 * ({@link REGISTRY_PATHS}) and the legacy dotted alias
 * ({@link LEGACY_REGISTRY_PATHS}), pointing at one shared handler instance.
 * This suite proves, via `supertest` against `createCoreApiApp` on a temp
 * SQLite, that the slash and dotted families are byte-identical (modulo
 * time-dependent fields) for register / heartbeat / deregister / snapshot — so
 * an old-SDK pillar (dotted) and a new-SDK pillar (slash) get the same
 * behavior. The legacy-path-hit metric is unit-tested separately to assert it
 * fires on the dotted alias only.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LEGACY_REGISTRY_PATHS, REGISTRY_PATHS, type ManifestPayload } from '@pops/pillar-sdk';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { makeLegacyPathMetric } from '../modules/registry/legacy-path-metric.js';

import type { Request, Response } from 'express';

type App = ReturnType<typeof createCoreApiApp>;

let tmpDir: string;
const opened: OpenedCoreDb[] = [];

function bootApp(): App {
  const dir = mkdtempSync(join(tmpDir, 'db-'));
  const coreDb = openCoreDb(join(dir, 'core.db'));
  opened.push(coreDb);
  return createCoreApiApp({ coreDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3001' });
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
    healthcheck: { path: '/health' },
  };
}

function registerBody(): Record<string, unknown> {
  return { pillarId: 'finance', baseUrl: 'http://finance-api:3004', manifest: financeManifest() };
}

const VOLATILE_KEYS = new Set(['registeredAt', 'lastHeartbeatAt', 'statusUpdatedAt', 'fetchedAt']);

/** Strip time-dependent fields so two fresh registries compare structurally. */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = VOLATILE_KEYS.has(key) ? '<volatile>' : normalize(v);
    }
    return out;
  }
  return value;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-dual-serve-'));
});

afterEach(() => {
  for (const db of opened.splice(0)) {
    try {
      db.raw.close();
    } catch {
      // ignore close noise — surface the original failure
    }
  }
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('registry route dual-serve', () => {
  it('register: slash and dotted are byte-identical on fresh registries', async () => {
    const slash = bootApp();
    const dotted = bootApp();

    const a = await request(slash).post(REGISTRY_PATHS.register).send(registerBody());
    const b = await request(dotted).post(LEGACY_REGISTRY_PATHS.register).send(registerBody());

    expect(a.status).toBe(200);
    expect(b.status).toBe(a.status);
    expect(normalize(b.body)).toEqual(normalize(a.body));
    expect((a.body as { ok: boolean; pillarId: string }).ok).toBe(true);
    expect((a.body as { pillarId: string }).pillarId).toBe('finance');
  });

  it('heartbeat: slash and dotted are byte-identical after registering', async () => {
    const slash = bootApp();
    const dotted = bootApp();
    await request(slash).post(REGISTRY_PATHS.register).send(registerBody());
    await request(dotted).post(LEGACY_REGISTRY_PATHS.register).send(registerBody());

    const a = await request(slash).post(REGISTRY_PATHS.heartbeat).send({ pillarId: 'finance' });
    const b = await request(dotted)
      .post(LEGACY_REGISTRY_PATHS.heartbeat)
      .send({ pillarId: 'finance' });

    expect(a.status).toBe(200);
    expect(b.status).toBe(a.status);
    expect(normalize(b.body)).toEqual(normalize(a.body));
    expect((a.body as { ok: boolean }).ok).toBe(true);
  });

  it('heartbeat soft-fails identically (200 not-registered) for an unknown pillar', async () => {
    const slash = bootApp();
    const dotted = bootApp();

    const a = await request(slash).post(REGISTRY_PATHS.heartbeat).send({ pillarId: 'ghost' });
    const b = await request(dotted)
      .post(LEGACY_REGISTRY_PATHS.heartbeat)
      .send({ pillarId: 'ghost' });

    expect(a.status).toBe(200);
    expect(b.status).toBe(a.status);
    expect(a.body).toEqual({ ok: false, reason: 'not-registered' });
    expect(b.body).toEqual(a.body);
  });

  it('deregister: slash and dotted are byte-identical after registering', async () => {
    const slash = bootApp();
    const dotted = bootApp();
    await request(slash).post(REGISTRY_PATHS.register).send(registerBody());
    await request(dotted).post(LEGACY_REGISTRY_PATHS.register).send(registerBody());

    const a = await request(slash).post(REGISTRY_PATHS.deregister).send({ pillarId: 'finance' });
    const b = await request(dotted)
      .post(LEGACY_REGISTRY_PATHS.deregister)
      .send({ pillarId: 'finance' });

    expect(a.status).toBe(200);
    expect(b.status).toBe(a.status);
    expect(a.body).toEqual({ ok: true, removed: true });
    expect(b.body).toEqual(a.body);
  });

  it('snapshot: slash and dotted are byte-identical after registering', async () => {
    const slash = bootApp();
    const dotted = bootApp();
    await request(slash).post(REGISTRY_PATHS.register).send(registerBody());
    await request(dotted).post(LEGACY_REGISTRY_PATHS.register).send(registerBody());

    const a = await request(slash).get(REGISTRY_PATHS.snapshot);
    const b = await request(dotted).get(LEGACY_REGISTRY_PATHS.snapshot);

    expect(a.status).toBe(200);
    expect(b.status).toBe(a.status);
    expect(normalize(b.body)).toEqual(normalize(a.body));
    const body = a.body as { pillars: Array<{ pillarId: string }>; fetchedAt: string };
    expect(body.pillars).toHaveLength(1);
    expect(body.pillars[0]?.pillarId).toBe('finance');
    expect('result' in (a.body as Record<string, unknown>)).toBe(false);
  });

  it('the SAME app serves both families against one shared registry', async () => {
    const app = bootApp();
    await request(app).post(REGISTRY_PATHS.register).send(registerBody());

    const viaSlash = await request(app).get(REGISTRY_PATHS.snapshot);
    const viaDotted = await request(app).get(LEGACY_REGISTRY_PATHS.snapshot);

    expect(viaSlash.status).toBe(200);
    expect(viaDotted.status).toBe(200);
    expect(normalize(viaDotted.body)).toEqual(normalize(viaSlash.body));
  });
});

function runMetric(method: string, path: string): { warned: number; warnPaths: string[] } {
  const warnPaths: string[] = [];
  const middleware = makeLegacyPathMetric({
    sink: {
      warn(payload) {
        warnPaths.push(String((payload as { path?: unknown }).path));
      },
    },
  });
  let nextCalled = false;
  const req = { path, method } as unknown as Request;
  const res = {} as Response;
  middleware(req, res, () => {
    nextCalled = true;
  });
  expect(nextCalled).toBe(true);
  return { warned: warnPaths.length, warnPaths };
}

describe('legacy-path-hit metric', () => {
  it('fires on each legacy dotted path', () => {
    for (const path of Object.values(LEGACY_REGISTRY_PATHS)) {
      const { warned, warnPaths } = runMetric('POST', path);
      expect(warned).toBe(1);
      expect(warnPaths).toEqual([path]);
    }
  });

  it('does NOT fire on the canonical slash paths', () => {
    for (const path of Object.values(REGISTRY_PATHS)) {
      const { warned } = runMetric('POST', path);
      expect(warned).toBe(0);
    }
  });

  it('does NOT fire on unrelated paths and always calls next()', () => {
    expect(runMetric('GET', '/health').warned).toBe(0);
    expect(runMetric('GET', '/pillars').warned).toBe(0);
  });
});
