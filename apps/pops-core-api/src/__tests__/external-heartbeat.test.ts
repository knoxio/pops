/**
 * Integration tests for `POST /core.registry.heartbeat` (Theme 13 PRD-228 US-02).
 *
 * Boots the full Express factory against a temp-dir core.db with an
 * injected `resolveApiKey` callback, then drives the wire surface end
 * to end via `supertest`. Asserts the user-story acceptance criteria:
 *   - happy path: 200 + bumped `lastHeartbeatAt` + no event when status
 *     stays healthy.
 *   - bad shared key: 401, no row mutation.
 *   - rotated stored hash (key was rotated but env was not — or vice
 *     versa): 401.
 *   - missing pillar row: 200 `{ ok: false, reason: 'not-registered' }`
 *     (so the external SDK re-registers cleanly).
 *   - missing api key env: 500.
 *   - heartbeat that flips `unavailable → healthy` emits a single
 *     `health-changed` event.
 *   - malformed body: 400.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, pillarRegistryService, type OpenedCoreDb } from '@pops/core-db';

import { createCoreApiApp } from '../app.js';
import { registryEventBus, type RegistryEventPayload } from '../modules/registry/event-bus.js';

import type { ManifestPayload } from '@pops/pillar-sdk';

const VALID_API_KEY = 'super-secret-shared-key';

function recipesManifest(overrides?: Partial<ManifestPayload>): ManifestPayload {
  return {
    pillar: 'recipes',
    version: '0.1.0',
    contract: {
      package: '@pops/recipes-contract',
      version: '0.1.0',
      tag: 'contract-recipes@v0.1.0',
    },
    routes: {
      queries: ['recipes.library.list'],
      mutations: ['recipes.library.create'],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: ['recipes/recipe'] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
    ...overrides,
  };
}

async function registerRecipes(
  app: ReturnType<typeof createCoreApiApp>,
  apiKey: string = VALID_API_KEY
): Promise<void> {
  const res = await request(app).post('/core.registry.register').send({
    pillarId: 'recipes',
    baseUrl: 'http://recipes-api:4010',
    manifest: recipesManifest(),
    apiKey,
  });
  if (res.status !== 200) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

let tmpDir: string;
let coreDb: OpenedCoreDb;
let app: ReturnType<typeof createCoreApiApp>;
let resolvedKey: string | undefined;
let capturedEvents: RegistryEventPayload[];
let eventListener: (payload: RegistryEventPayload) => void;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-hb-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  resolvedKey = VALID_API_KEY;
  capturedEvents = [];
  eventListener = (payload) => capturedEvents.push(payload);
  registryEventBus.on('registry:event', eventListener);
  app = createCoreApiApp({
    coreDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3001',
    resolveApiKey: () => resolvedKey,
  });
});

afterEach(() => {
  registryEventBus.off('registry:event', eventListener);
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /core.registry.heartbeat — happy path', () => {
  it('bumps lastHeartbeatAt, keeps status healthy, emits no event on a healthy-to-healthy heartbeat', async () => {
    await registerRecipes(app);
    const initial = pillarRegistryService.getPillarRegistration(coreDb.db, 'recipes');
    expect(initial).not.toBeNull();

    capturedEvents = [];

    await new Promise((r) => setTimeout(r, 5));

    const res = await request(app).post('/core.registry.heartbeat').send({
      pillarId: 'recipes',
      apiKey: VALID_API_KEY,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      pillarId: 'recipes',
      status: 'healthy',
      statusChanged: false,
    });
    expect(typeof res.body.lastHeartbeatAt).toBe('string');

    const updated = pillarRegistryService.getPillarRegistration(coreDb.db, 'recipes');
    expect(updated?.lastHeartbeatAt).not.toBe(initial?.lastHeartbeatAt);
    expect(updated?.status).toBe('healthy');
    expect(capturedEvents.filter((e) => e.event === 'health-changed')).toHaveLength(0);
  });

  it('emits a health-changed event when the heartbeat flips unavailable → healthy', async () => {
    await registerRecipes(app);
    pillarRegistryService.applyStatusUpdates(coreDb.db, [
      {
        pillarId: 'recipes',
        status: 'unavailable',
        statusUpdatedAt: new Date().toISOString(),
      },
    ]);
    capturedEvents = [];

    const res = await request(app).post('/core.registry.heartbeat').send({
      pillarId: 'recipes',
      apiKey: VALID_API_KEY,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, status: 'healthy', statusChanged: true });

    const healthChanged = capturedEvents.filter((e) => e.event === 'health-changed');
    expect(healthChanged).toHaveLength(1);
    expect(healthChanged[0].pillarId).toBe('recipes');
    expect(healthChanged[0].origin).toBe('external');
  });
});

describe('POST /core.registry.heartbeat — authentication', () => {
  it('returns 401 with no row mutation when the shared apiKey does not match', async () => {
    await registerRecipes(app);
    const before = pillarRegistryService.getPillarRegistration(coreDb.db, 'recipes');
    capturedEvents = [];

    const res = await request(app).post('/core.registry.heartbeat').send({
      pillarId: 'recipes',
      apiKey: 'wrong-key',
    });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, reason: 'invalid-api-key' });
    const after = pillarRegistryService.getPillarRegistration(coreDb.db, 'recipes');
    expect(after?.lastHeartbeatAt).toBe(before?.lastHeartbeatAt);
    expect(capturedEvents).toEqual([]);
  });

  it('returns 401 when the per-row apiKeyHash does not match (registered under a rotated key)', async () => {
    resolvedKey = 'first-key';
    await registerRecipes(app, 'first-key');
    resolvedKey = 'rotated-key';

    const res = await request(app).post('/core.registry.heartbeat').send({
      pillarId: 'recipes',
      apiKey: 'rotated-key',
    });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, reason: 'invalid-api-key' });
  });

  it('returns 500 when POPS_INTERNAL_API_KEY is not configured on core-api', async () => {
    await registerRecipes(app);
    resolvedKey = undefined;
    const res = await request(app).post('/core.registry.heartbeat').send({
      pillarId: 'recipes',
      apiKey: VALID_API_KEY,
    });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, reason: 'api-key-not-configured' });
  });
});

describe('POST /core.registry.heartbeat — missing pillar', () => {
  it('returns 200 { ok: false, reason: not-registered } when the pillar has never registered (with valid shared key)', async () => {
    const res = await request(app).post('/core.registry.heartbeat').send({
      pillarId: 'recipes',
      apiKey: VALID_API_KEY,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false, reason: 'not-registered' });
  });

  it('returns 401 when the pillar is missing AND the shared apiKey is wrong (auth gate is checked first)', async () => {
    const res = await request(app).post('/core.registry.heartbeat').send({
      pillarId: 'recipes',
      apiKey: 'wrong-key',
    });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, reason: 'invalid-api-key' });
  });
});

describe('POST /core.registry.heartbeat — body validation', () => {
  it('returns 400 with structured issues when pillarId is missing', async () => {
    const res = await request(app).post('/core.registry.heartbeat').send({
      apiKey: VALID_API_KEY,
    });
    expect(res.status).toBe(400);
    const fields = res.body.issues.map((i: { field: string }) => i.field);
    expect(fields).toContain('pillarId');
  });

  it('returns 400 when apiKey is missing', async () => {
    const res = await request(app).post('/core.registry.heartbeat').send({
      pillarId: 'recipes',
    });
    expect(res.status).toBe(400);
    const fields = res.body.issues.map((i: { field: string }) => i.field);
    expect(fields).toContain('apiKey');
  });
});
