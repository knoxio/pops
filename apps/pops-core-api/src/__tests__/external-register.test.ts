/**
 * Integration tests for `POST /core.registry.register` (Theme 13 PRD-228 US-01).
 *
 * Boots the full Express factory against a temp-dir core.db with an
 * injected `resolveApiKey` callback, then drives the wire surface end
 * to end via `supertest`. Asserts the contract from the user-story
 * acceptance criteria:
 *   - happy path: 200 + persisted row + emitted `registered` event.
 *   - bad key: 401, no persistence, no event.
 *   - malformed manifest: 400 with per-field issues.
 *   - reserved pillar id: 409 with `pillar-id-reserved`.
 *   - bad pillar slug: 400 with the regex reason.
 *   - cross-field mismatch (`manifest.pillar !== pillarId`): 400.
 *   - duplicate registration: `registeredAt` preserved, `apiKeyHash`
 *     refreshed on key rotation.
 *   - missing fields: 400 with structured issues.
 *   - missing env key: 500 (mis-deployed core-api refuses to register
 *     anyone rather than silently accepting every request).
 */
import { createHash } from 'node:crypto';
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

let tmpDir: string;
let coreDb: OpenedCoreDb;
let app: ReturnType<typeof createCoreApiApp>;
let resolvedKey: string | undefined;
let capturedEvents: RegistryEventPayload[];
let eventListener: (payload: RegistryEventPayload) => void;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-extreg-'));
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

describe('POST /core.registry.register — happy path', () => {
  it('persists the row with origin=external + sha256 key hash + healthy status and emits a registered event', async () => {
    const manifest = recipesManifest();
    const res = await request(app).post('/core.registry.register').send({
      pillarId: 'recipes',
      baseUrl: 'http://recipes-api:4010',
      manifest,
      apiKey: VALID_API_KEY,
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
    expect(persisted?.apiKeyHash).toBe(
      createHash('sha256').update(VALID_API_KEY, 'utf8').digest('hex')
    );

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
      apiKey: VALID_API_KEY,
    });
    expect(res.status).toBe(200);
    expect(res.body.pillarId).toBe('home-brew');
  });
});

describe('POST /core.registry.register — authentication', () => {
  it('returns 401 with no persistence when the apiKey does not match', async () => {
    const res = await request(app).post('/core.registry.register').send({
      pillarId: 'recipes',
      baseUrl: 'http://recipes-api:4010',
      manifest: recipesManifest(),
      apiKey: 'wrong-key',
    });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, reason: 'invalid-api-key' });
    expect(pillarRegistryService.getPillarRegistration(coreDb.db, 'recipes')).toBeNull();
    expect(capturedEvents).toEqual([]);
  });

  it('returns 401 when the apiKey has a different length (no length oracle)', async () => {
    const res = await request(app).post('/core.registry.register').send({
      pillarId: 'recipes',
      baseUrl: 'http://recipes-api:4010',
      manifest: recipesManifest(),
      apiKey: 'x',
    });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, reason: 'invalid-api-key' });
  });

  it('returns 500 when POPS_INTERNAL_API_KEY is not configured on core-api', async () => {
    resolvedKey = undefined;
    const res = await request(app).post('/core.registry.register').send({
      pillarId: 'recipes',
      baseUrl: 'http://recipes-api:4010',
      manifest: recipesManifest(),
      apiKey: VALID_API_KEY,
    });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, reason: 'api-key-not-configured' });
  });
});

describe('POST /core.registry.register — pillar id validation', () => {
  for (const reserved of ['core', 'finance', 'media', 'inventory', 'cerebrum', 'food', 'lists']) {
    it(`returns 409 pillar-id-reserved for the in-tree id '${reserved}'`, async () => {
      const manifest = recipesManifest({
        pillar: reserved,
        contract: {
          package: `@pops/${reserved}-contract`,
          version: '0.1.0',
          tag: `contract-${reserved}@v0.1.0`,
        },
        routes: {
          queries: [`${reserved}.library.list`],
          mutations: [`${reserved}.library.create`],
          subscriptions: [],
        },
        uri: { types: [`${reserved}/recipe`] },
      });
      const res = await request(app).post('/core.registry.register').send({
        pillarId: reserved,
        baseUrl: 'http://x:4010',
        manifest,
        apiKey: VALID_API_KEY,
      });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        ok: false,
        reason: 'pillar-id-reserved',
        pillarId: reserved,
      });
    });
  }

  it('rejects a pillarId that starts with a digit', async () => {
    const res = await request(app)
      .post('/core.registry.register')
      .send({
        pillarId: '1recipes',
        baseUrl: 'http://x:4010',
        manifest: recipesManifest({ pillar: '1recipes' }),
        apiKey: VALID_API_KEY,
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
        apiKey: VALID_API_KEY,
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
          settings: { keys: [] },
          healthcheck: { path: '/' },
        },
        apiKey: VALID_API_KEY,
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
        apiKey: VALID_API_KEY,
      });
    expect(res.status).toBe(400);
    const fields = res.body.issues.map((i: { field: string }) => i.field);
    expect(fields).toContain('manifest.pillar');
  });

  it('rejects a missing manifest field', async () => {
    const res = await request(app).post('/core.registry.register').send({
      pillarId: 'recipes',
      baseUrl: 'http://recipes-api:4010',
      apiKey: VALID_API_KEY,
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
      apiKey: VALID_API_KEY,
    });
    expect(res.status).toBe(400);
    const fields = res.body.issues.map((i: { field: string }) => i.field);
    expect(fields).toContain('baseUrl');
  });
});

describe('POST /core.registry.register — duplicate registration', () => {
  it('preserves registeredAt on re-registration and refreshes apiKeyHash on key rotation', async () => {
    const first = await request(app).post('/core.registry.register').send({
      pillarId: 'recipes',
      baseUrl: 'http://recipes-api:4010',
      manifest: recipesManifest(),
      apiKey: VALID_API_KEY,
    });
    expect(first.status).toBe(200);
    const firstRegisteredAt = first.body.registeredAt;

    await new Promise((r) => setTimeout(r, 5));

    const rotatedKey = 'rotated-shared-key';
    resolvedKey = rotatedKey;
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
        apiKey: rotatedKey,
      });
    expect(second.status).toBe(200);
    expect(second.body.registeredAt).toBe(firstRegisteredAt);

    const persisted = pillarRegistryService.getPillarRegistration(coreDb.db, 'recipes');
    expect(persisted?.baseUrl).toBe('http://recipes-api:9999');
    expect(persisted?.contractVersion).toBe('0.2.0');
    expect(persisted?.apiKeyHash).toBe(
      createHash('sha256').update(rotatedKey, 'utf8').digest('hex')
    );
    expect(persisted?.origin).toBe('external');

    const registered = capturedEvents.filter((e) => e.event === 'registered');
    expect(registered).toHaveLength(2);
  });
});
