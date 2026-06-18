/**
 * Integration tests for `POST /core.registry.register` (Theme 13 PRD-228 US-01).
 *
 * Boots the full Express factory against a temp-dir core.db and drives
 * the wire surface end to end via `supertest`. Asserts the contract from
 * the user-story acceptance criteria:
 *   - happy path: 200 + persisted row + emitted `registered` event.
 *   - malformed manifest: 400 with per-field issues.
 *   - reserved pillar id (PRD-250): 200 — in-tree pillar IDs are no
 *     longer rejected at the registry surface.
 *   - bad pillar slug: 400 with the regex reason.
 *   - cross-field mismatch (`manifest.pillar !== pillarId`): 400.
 *   - missing fields: 400 with structured issues.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, pillarRegistryService, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { registryEventBus, type RegistryEventPayload } from '../modules/registry/event-bus.js';

import type { ManifestPayload } from '@pops/pillar-sdk';

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

let tmpDir: string;
let coreDb: OpenedCoreDb;
let app: ReturnType<typeof createCoreApiApp>;
let capturedEvents: RegistryEventPayload[];
let eventListener: (payload: RegistryEventPayload) => void;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-extreg-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  capturedEvents = [];
  eventListener = (payload) => capturedEvents.push(payload);
  registryEventBus.on('registry:event', eventListener);
  app = createCoreApiApp({
    coreDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3001',
  });
});

afterEach(() => {
  registryEventBus.off('registry:event', eventListener);
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /core.registry.register — happy path', () => {
  it('persists the row with origin=external + healthy status and emits a registered event', async () => {
    const manifest = recipesManifest();
    const res = await request(app).post('/core.registry.register').send({
      pillarId: 'recipes',
      baseUrl: 'http://recipes-api:4010',
      manifest,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      pillarId: 'recipes',
      heartbeatIntervalMs: 10_000,
    });
    expect(typeof res.body.registeredAt).toBe('string');
    expect(() => new Date(res.body.registeredAt).toISOString()).not.toThrow();

    const persisted = pillarRegistryService.getPillarRegistration(coreDb.db, 'recipes');
    expect(persisted).not.toBeNull();
    expect(persisted?.origin).toBe('external');
    expect(persisted?.status).toBe('healthy');
    expect(persisted?.evictedAt).toBeNull();
    expect(persisted?.apiKeyHash).toBeNull();

    const registered = capturedEvents.filter((e) => e.event === 'registered');
    expect(registered).toHaveLength(1);
    expect(registered[0].pillarId).toBe('recipes');
  });

  it('accepts a multi-segment kebab pillar slug', async () => {
    const manifest = recipesManifest({
      pillar: 'home-brew',
      contract: {
        package: '@pops/home-brew-contract',
        version: '0.1.0',
        tag: 'contract-home-brew@v0.1.0',
      },
      routes: {
        queries: ['homebrew.library.list'],
        mutations: ['homebrew.library.create'],
        subscriptions: [],
      },
      uri: { types: ['home-brew/recipe'] },
    });
    const res = await request(app).post('/core.registry.register').send({
      pillarId: 'home-brew',
      baseUrl: 'http://home-brew-api:4010',
      manifest,
    });
    expect(res.status).toBe(200);
    expect(res.body.pillarId).toBe('home-brew');
  });

  it('accepts an in-tree pillar id (PRD-250: pillars self-register at boot)', async () => {
    const manifest = recipesManifest({
      pillar: 'finance',
      contract: {
        package: '@pops/finance-contract',
        version: '0.1.0',
        tag: 'contract-finance@v0.1.0',
      },
      routes: {
        queries: ['finance.library.list'],
        mutations: ['finance.library.create'],
        subscriptions: [],
      },
      uri: { types: ['finance/recipe'] },
    });
    const res = await request(app).post('/core.registry.register').send({
      pillarId: 'finance',
      baseUrl: 'http://finance-api:3004',
      manifest,
    });
    expect(res.status).toBe(200);
    expect(res.body.pillarId).toBe('finance');
  });
});

describe('POST /core.registry.register — pillar id validation', () => {
  it('rejects a pillarId that starts with a digit', async () => {
    const res = await request(app)
      .post('/core.registry.register')
      .send({
        pillarId: '1recipes',
        baseUrl: 'http://x:4010',
        manifest: recipesManifest({ pillar: '1recipes' }),
      });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.issues[0].field).toBe('pillarId');
  });

  it('rejects a pillarId with uppercase letters', async () => {
    const res = await request(app)
      .post('/core.registry.register')
      .send({
        pillarId: 'Recipes',
        baseUrl: 'http://x:4010',
        manifest: recipesManifest({ pillar: 'Recipes' }),
      });
    expect(res.status).toBe(400);
    expect(res.body.issues[0].field).toBe('pillarId');
  });
});

describe('POST /core.registry.register — manifest validation', () => {
  it('returns 400 with structured issues when the manifest is malformed', async () => {
    const res = await request(app)
      .post('/core.registry.register')
      .send({
        pillarId: 'recipes',
        baseUrl: 'http://recipes-api:4010',
        manifest: {
          pillar: 'recipes',
          version: 'not-semver',
          contract: { package: 'wrong', version: 'not-semver', tag: 'wrong' },
          routes: { queries: [], mutations: [], subscriptions: [] },
          search: { adapters: [] },
          ai: { tools: [] },
          uri: { types: [] },
          consumedSettings: { keys: [] },
          healthcheck: { path: '/' },
        },
      });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues.length).toBeGreaterThan(0);
    expect(pillarRegistryService.getPillarRegistration(coreDb.db, 'recipes')).toBeNull();
  });

  it('rejects pillarId / manifest.pillar mismatch with a cross-field issue', async () => {
    const res = await request(app)
      .post('/core.registry.register')
      .send({
        pillarId: 'recipes',
        baseUrl: 'http://recipes-api:4010',
        manifest: recipesManifest({
          pillar: 'something-else',
          contract: {
            package: '@pops/something-else-contract',
            version: '0.1.0',
            tag: 'contract-something-else@v0.1.0',
          },
        }),
      });
    expect(res.status).toBe(400);
    const fields = res.body.issues.map((i: { field: string }) => i.field);
    expect(fields).toContain('manifest.pillar');
  });

  it('rejects a missing manifest field', async () => {
    const res = await request(app).post('/core.registry.register').send({
      pillarId: 'recipes',
      baseUrl: 'http://recipes-api:4010',
    });
    expect(res.status).toBe(400);
    const fields = res.body.issues.map((i: { field: string }) => i.field);
    expect(fields).toContain('manifest');
  });

  it('rejects a non-URL baseUrl', async () => {
    const res = await request(app).post('/core.registry.register').send({
      pillarId: 'recipes',
      baseUrl: 'not-a-url',
      manifest: recipesManifest(),
    });
    expect(res.status).toBe(400);
    const fields = res.body.issues.map((i: { field: string }) => i.field);
    expect(fields).toContain('baseUrl');
  });
});

describe('POST /core.registry.register — duplicate registration', () => {
  it('preserves registeredAt on re-registration and overwrites the row contents', async () => {
    const first = await request(app).post('/core.registry.register').send({
      pillarId: 'recipes',
      baseUrl: 'http://recipes-api:4010',
      manifest: recipesManifest(),
    });
    expect(first.status).toBe(200);
    const firstRegisteredAt = first.body.registeredAt;

    await new Promise((r) => setTimeout(r, 5));

    const second = await request(app)
      .post('/core.registry.register')
      .send({
        pillarId: 'recipes',
        baseUrl: 'http://recipes-api:9999',
        manifest: recipesManifest({
          version: '0.2.0',
          contract: {
            package: '@pops/recipes-contract',
            version: '0.2.0',
            tag: 'contract-recipes@v0.2.0',
          },
        }),
      });
    expect(second.status).toBe(200);
    expect(second.body.registeredAt).toBe(firstRegisteredAt);

    const persisted = pillarRegistryService.getPillarRegistration(coreDb.db, 'recipes');
    expect(persisted?.baseUrl).toBe('http://recipes-api:9999');
    expect(persisted?.contractVersion).toBe('0.2.0');
    expect(persisted?.origin).toBe('external');

    const registered = capturedEvents.filter((e) => e.event === 'registered');
    expect(registered).toHaveLength(2);
  });
});
