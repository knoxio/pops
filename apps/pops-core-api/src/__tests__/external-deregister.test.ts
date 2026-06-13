/**
 * Integration tests for `POST /core.registry.deregister` (Theme 13 PRD-228 US-04).
 *
 * Drives the external clean-shutdown surface through `supertest`.
 * Acceptance criteria covered:
 *   - happy path: 200 + row DELETEd + `deregistered` event with
 *     `reason: 'requested'`.
 *   - bad shared key: 401.
 *   - rotated stored hash: 401.
 *   - missing row (already deregistered): idempotent 200 with no event
 *     emitted (PRD: "DELETE is idempotent").
 *   - internal-origin row: 403 with
 *     `internal-pillar-not-deregisterable-externally`.
 *   - missing env key: 500.
 *   - malformed body: 400.
 *   - calling deregister twice in a row produces the same end state.
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
    settings: { keys: [] },
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
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-dereg-'));
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

describe('POST /core.registry.deregister — happy path', () => {
  it('deletes the row and emits a deregistered event with reason=requested', async () => {
    await registerRecipes(app);
    capturedEvents = [];

    const res = await request(app).post('/core.registry.deregister').send({
      pillarId: 'recipes',
      apiKey: VALID_API_KEY,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, removed: true });
    expect(pillarRegistryService.getPillarRegistration(coreDb.db, 'recipes')).toBeNull();

    const dereg = capturedEvents.filter((e) => e.event === 'deregistered');
    expect(dereg).toHaveLength(1);
    expect(dereg[0]).toMatchObject({
      pillarId: 'recipes',
      origin: 'external',
      reason: 'requested',
    });
  });
});

describe('POST /core.registry.deregister — authentication', () => {
  it('returns 401 with no deletion when the shared apiKey is wrong', async () => {
    await registerRecipes(app);
    capturedEvents = [];

    const res = await request(app).post('/core.registry.deregister').send({
      pillarId: 'recipes',
      apiKey: 'wrong-key',
    });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, reason: 'invalid-api-key' });
    expect(pillarRegistryService.getPillarRegistration(coreDb.db, 'recipes')).not.toBeNull();
    expect(capturedEvents).toEqual([]);
  });

  it('returns 401 when the per-row apiKeyHash does not match (key rotation)', async () => {
    resolvedKey = 'first-key';
    await registerRecipes(app, 'first-key');
    resolvedKey = 'rotated-key';

    const res = await request(app).post('/core.registry.deregister').send({
      pillarId: 'recipes',
      apiKey: 'rotated-key',
    });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, reason: 'invalid-api-key' });
    expect(pillarRegistryService.getPillarRegistration(coreDb.db, 'recipes')).not.toBeNull();
  });

  it('returns 500 when POPS_INTERNAL_API_KEY is not configured', async () => {
    await registerRecipes(app);
    resolvedKey = undefined;
    const res = await request(app).post('/core.registry.deregister').send({
      pillarId: 'recipes',
      apiKey: VALID_API_KEY,
    });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, reason: 'api-key-not-configured' });
  });
});

describe('POST /core.registry.deregister — idempotency', () => {
  it('returns 200 { ok: true, removed: false } and emits NO event for a pillar that never registered', async () => {
    const res = await request(app).post('/core.registry.deregister').send({
      pillarId: 'recipes',
      apiKey: VALID_API_KEY,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, removed: false });
    expect(capturedEvents).toEqual([]);
  });

  it('deregistering twice leaves the same end state and emits exactly one deregistered event', async () => {
    await registerRecipes(app);
    capturedEvents = [];

    const first = await request(app).post('/core.registry.deregister').send({
      pillarId: 'recipes',
      apiKey: VALID_API_KEY,
    });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, removed: true });

    const second = await request(app).post('/core.registry.deregister').send({
      pillarId: 'recipes',
      apiKey: VALID_API_KEY,
    });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ ok: true, removed: false });

    expect(pillarRegistryService.getPillarRegistration(coreDb.db, 'recipes')).toBeNull();
    expect(capturedEvents.filter((e) => e.event === 'deregistered')).toHaveLength(1);
  });
});

describe('POST /core.registry.deregister — internal pillar refusal', () => {
  it('returns 403 internal-pillar-not-deregisterable-externally when the row was registered via the in-tree bootstrap path', async () => {
    pillarRegistryService.upsertPillarRegistration(coreDb.db, {
      baseUrl: 'http://finance-api:3004',
      manifest: {
        pillar: 'finance',
        contract: {
          package: '@pops/finance-contract',
          version: '0.1.0',
          tag: 'contract-finance@v0.1.0',
        },
      },
      now: new Date().toISOString(),
      origin: 'internal',
    });
    capturedEvents = [];

    const res = await request(app).post('/core.registry.deregister').send({
      pillarId: 'finance',
      apiKey: VALID_API_KEY,
    });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      ok: false,
      reason: 'internal-pillar-not-deregisterable-externally',
    });
    expect(pillarRegistryService.getPillarRegistration(coreDb.db, 'finance')).not.toBeNull();
    expect(capturedEvents).toEqual([]);
  });
});

describe('POST /core.registry.deregister — body validation', () => {
  it('returns 400 when pillarId is missing', async () => {
    const res = await request(app).post('/core.registry.deregister').send({
      apiKey: VALID_API_KEY,
    });
    expect(res.status).toBe(400);
    const fields = res.body.issues.map((i: { field: string }) => i.field);
    expect(fields).toContain('pillarId');
  });

  it('returns 400 when apiKey is missing', async () => {
    const res = await request(app).post('/core.registry.deregister').send({
      pillarId: 'recipes',
    });
    expect(res.status).toBe(400);
    const fields = res.body.issues.map((i: { field: string }) => i.field);
    expect(fields).toContain('apiKey');
  });
});
