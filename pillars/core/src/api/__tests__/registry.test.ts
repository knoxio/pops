/**
 * Integration tests for the registry discovery snapshot — `GET /core.registry.list`
 * (Theme 13 PRD-161). The collapsed pillar serves the DB-backed snapshot as a
 * raw HTTP route (no tRPC); the pillar SDK's `HttpDiscoveryTransport` reads it.
 *
 * Boots the full Express factory against a temp-dir core.db and drives the wire
 * end to end via `supertest`. Register/deregister HTTP edge cases live in
 * `external-register.test.ts` / `external-deregister.test.ts`; this file pins
 * the snapshot contract and the persistence semantics observable through it:
 *   - empty registry → `{ pillars: [], fetchedAt }`
 *   - every registered pillar surfaces with healthy status + timestamps
 *   - duplicate register: last write wins, `registeredAt` preserved
 *   - manifest blob replaced on every successful register
 *   - deregister removes the entry from the snapshot
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';

import type { ManifestPayload } from '@pops/pillar-sdk';

let tmpDir: string;
let coreDb: OpenedCoreDb;
let app: ReturnType<typeof createCoreApiApp>;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-registry-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  app = createCoreApiApp({ coreDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3001' });
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function financeManifest(overrides?: Partial<ManifestPayload>): ManifestPayload {
  return {
    pillar: 'finance',
    version: '1.2.3',
    contract: {
      package: '@pops/finance-contract',
      version: '1.2.3',
      tag: 'contract-finance@v1.2.3',
    },
    routes: {
      queries: ['finance.transactions.list', 'finance.transactions.search'],
      mutations: ['finance.transactions.create'],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: ['finance/transaction'] },
    consumedSettings: { keys: ['finance.defaultCurrency'] },
    healthcheck: { path: '/healthz' },
    ...overrides,
  };
}

function mediaManifest(): ManifestPayload {
  return {
    pillar: 'media',
    version: '0.5.0',
    contract: {
      package: '@pops/media-contract',
      version: '0.5.0',
      tag: 'contract-media@v0.5.0',
    },
    routes: { queries: ['media.library.list'], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: ['media/movie'] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/healthz' },
  };
}

interface RegisterResponse {
  ok: boolean;
  pillarId?: string;
  registeredAt?: string;
}

async function register(
  pillarId: string,
  baseUrl: string,
  manifest: ManifestPayload
): Promise<RegisterResponse> {
  const res = await request(app)
    .post('/core.registry.register')
    .send({ pillarId, baseUrl, manifest });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as RegisterResponse;
}

interface SnapshotEntry {
  pillarId: string;
  baseUrl: string;
  status: string;
  registeredAt: string;
  lastHeartbeatAt: string;
  contract: { package: string; version: string; tag: string };
  manifest: ManifestPayload;
}

async function listSnapshot(): Promise<{ pillars: SnapshotEntry[]; fetchedAt: string }> {
  const res = await request(app).get('/core.registry.list');
  expect(res.status).toBe(200);
  return res.body as { pillars: SnapshotEntry[]; fetchedAt: string };
}

describe('GET /core.registry.list — snapshot', () => {
  it('returns an empty array (with a fetchedAt stamp) when no pillars are registered', async () => {
    const snapshot = await listSnapshot();
    expect(snapshot.pillars).toEqual([]);
    expect(typeof snapshot.fetchedAt).toBe('string');
    expect(snapshot.fetchedAt).toMatch(/T/);
  });

  it('returns every registered pillar with healthy status + timestamps', async () => {
    await register('finance', 'http://finance-api:3004', financeManifest());
    await register('media', 'http://media-api:3006', mediaManifest());

    const snapshot = await listSnapshot();
    expect(snapshot.pillars).toHaveLength(2);
    const ids = snapshot.pillars.map((p) => p.pillarId);
    expect(ids).toContain('finance');
    expect(ids).toContain('media');
    for (const p of snapshot.pillars) {
      expect(p.status).toBe('healthy');
      expect(p.registeredAt).toMatch(/T/);
      expect(p.lastHeartbeatAt).toMatch(/T/);
    }
  });

  it('omits an unknown pillar and surfaces a known one with its full contract', async () => {
    await register('finance', 'http://finance-api:3004', financeManifest());
    const snapshot = await listSnapshot();
    expect(snapshot.pillars.some((p) => p.pillarId === 'media')).toBe(false);
    const finance = snapshot.pillars.find((p) => p.pillarId === 'finance');
    expect(finance?.baseUrl).toBe('http://finance-api:3004');
    expect(finance?.contract.package).toBe('@pops/finance-contract');
  });
});

describe('register persistence semantics (observed through the snapshot)', () => {
  it('on duplicate register the last write wins; registeredAt is preserved', async () => {
    const first = await register('finance', 'http://finance-api:3004', financeManifest());
    const firstRegisteredAt = first.registeredAt;

    await new Promise((r) => setTimeout(r, 5));

    await register(
      'finance',
      'http://finance-api:9999',
      financeManifest({
        version: '2.0.0',
        contract: {
          package: '@pops/finance-contract',
          version: '2.0.0',
          tag: 'contract-finance@v2.0.0',
        },
      })
    );

    const entry = (await listSnapshot()).pillars.find((p) => p.pillarId === 'finance');
    expect(entry?.registeredAt).toBe(firstRegisteredAt);
    expect(entry?.baseUrl).toBe('http://finance-api:9999');
    expect(entry?.contract.version).toBe('2.0.0');
    expect(entry?.contract.tag).toBe('contract-finance@v2.0.0');
  });

  it('replaces the persisted manifest blob on every successful register', async () => {
    await register('finance', 'http://finance-api:3004', financeManifest());
    const updated = financeManifest({
      ai: {
        tools: [
          {
            name: 'updatedTool',
            description: 'A brand-new tool that did not exist before.',
            parameters: { type: 'object' },
          },
        ],
      },
    });
    await register('finance', 'http://finance-api:3004', updated);

    const entry = (await listSnapshot()).pillars.find((p) => p.pillarId === 'finance');
    expect(entry?.manifest).toEqual(updated);
  });

  it('drops a deregistered pillar from the snapshot', async () => {
    await register('finance', 'http://finance-api:3004', financeManifest());
    const res = await request(app).post('/core.registry.deregister').send({ pillarId: 'finance' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, removed: true });
    expect((await listSnapshot()).pillars).toEqual([]);
  });
});
