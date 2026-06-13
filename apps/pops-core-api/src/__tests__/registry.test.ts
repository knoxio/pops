/**
 * tRPC caller smoke tests for `core.registry.*` (Theme 13 PRD-161).
 *
 * Drives `appRouter.createCaller(ctx)` against a per-test in-memory
 * core.db. Covers the wire contract this PR ships:
 *   - valid register → ok + pillarId + registeredAt
 *   - invalid register (malformed payload) → ok=false + per-field issues
 *   - duplicate register (same pillar twice) → last-write wins, registeredAt preserved
 *   - register with bumped contract version → manifest replaced
 *   - list with multiple registered pillars
 *   - get unknown pillar → null
 *   - unregister + re-register cycle
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '@pops/core-db';

import { appRouter } from '../router.js';
import { type Context } from '../trpc.js';

import type { ManifestPayload } from '@pops/pillar-sdk';

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-registry-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function caller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: { email: 'dev@example.com' },
    serviceAccount: null,
    coreDb: coreDb.db,
  };
  return appRouter.createCaller(ctx);
}

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
    search: {
      adapters: [
        {
          name: 'transactionsAdapter',
          entityType: 'transaction',
          queryShape: {
            supportsText: true,
            supportsTags: false,
            supportsDateRange: false,
            supportsScope: [],
          },
          procedurePath: 'finance.transactions.search',
        },
      ],
    },
    ai: {
      tools: [
        {
          name: 'createTransaction',
          description: 'Create a transaction in the finance ledger.',
          parameters: { type: 'object' },
        },
      ],
    },
    uri: { types: ['finance/transaction'] },
    settings: { keys: ['finance.defaultCurrency'] },
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
    routes: {
      queries: ['media.library.list', 'media.library.search'],
      mutations: [],
      subscriptions: [],
    },
    search: {
      adapters: [
        {
          name: 'libraryAdapter',
          entityType: 'movie',
          queryShape: {
            supportsText: true,
            supportsTags: false,
            supportsDateRange: false,
            supportsScope: [],
          },
          procedurePath: 'media.library.search',
        },
      ],
    },
    ai: { tools: [] },
    uri: { types: ['media/movie'] },
    settings: { keys: [] },
    healthcheck: { path: '/healthz' },
  };
}

describe('core.registry.register', () => {
  it('accepts a valid manifest and returns ok with pillarId + registeredAt', async () => {
    const c = caller();
    const res = await c.core.registry.register({
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok=true');
    expect(res.pillarId).toBe('finance');
    expect(typeof res.registeredAt).toBe('string');
  });

  it('rejects a malformed manifest with structured per-field issues', async () => {
    const c = caller();
    const broken: unknown = {
      pillar: 'Finance!',
      version: 'not-semver',
      contract: {
        package: 'finance',
        version: 'not-semver',
        tag: 'wrong',
      },
      routes: { queries: [], mutations: [], subscriptions: [] },
      search: { adapters: [] },
      ai: { tools: [] },
      uri: { types: [] },
      settings: { keys: [] },
      healthcheck: { path: '/' },
    };
    const res = await c.core.registry.register({
      baseUrl: 'http://finance-api:3004',
      manifest: broken,
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected ok=false');
    expect(res.issues.length).toBeGreaterThan(0);
    const fields = res.issues.map((i) => i.field);
    expect(fields).toContain('pillar');
    expect(fields).toContain('version');
  });

  it('rejects a manifest whose contract.package does not match its pillar (cross-field)', async () => {
    const c = caller();
    const res = await c.core.registry.register({
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest({
        contract: {
          package: '@pops/media-contract',
          version: '1.2.3',
          tag: 'contract-media@v1.2.3',
        },
      }),
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected ok=false');
    expect(res.issues.some((i) => i.field === 'contract.package')).toBe(true);
  });

  it('rejects a baseUrl that is not a URL with a tRPC validation error', async () => {
    const c = caller();
    await expect(
      c.core.registry.register({
        baseUrl: 'not-a-url',
        manifest: financeManifest(),
      })
    ).rejects.toMatchObject({ name: 'TRPCError', code: 'BAD_REQUEST' });
  });

  it('on duplicate register the last write wins; registeredAt is preserved', async () => {
    const c = caller();
    const first = await c.core.registry.register({
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
    });
    if (!first.ok) throw new Error('first register should succeed');
    const firstRegisteredAt = first.registeredAt;

    await new Promise((r) => setTimeout(r, 5));

    const second = await c.core.registry.register({
      baseUrl: 'http://finance-api:9999',
      manifest: financeManifest({
        version: '2.0.0',
        contract: {
          package: '@pops/finance-contract',
          version: '2.0.0',
          tag: 'contract-finance@v2.0.0',
        },
      }),
    });
    if (!second.ok) throw new Error('second register should succeed');
    expect(second.registeredAt).toBe(firstRegisteredAt);

    const entry = await c.core.registry.get({ pillar: 'finance' });
    expect(entry?.baseUrl).toBe('http://finance-api:9999');
    expect(entry?.contract.version).toBe('2.0.0');
    expect(entry?.contract.tag).toBe('contract-finance@v2.0.0');
  });

  it('replaces the persisted manifest blob on every successful register', async () => {
    const c = caller();
    await c.core.registry.register({
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
    });
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
    await c.core.registry.register({
      baseUrl: 'http://finance-api:3004',
      manifest: updated,
    });
    const entry = await c.core.registry.get({ pillar: 'finance' });
    expect(entry?.manifest).toEqual(updated);
  });
});

describe('core.registry.list', () => {
  it('returns an empty array when no pillars are registered', async () => {
    const c = caller();
    const res = await c.core.registry.list();
    expect(res.pillars).toEqual([]);
    expect(typeof res.fetchedAt).toBe('string');
  });

  it('returns every registered pillar with healthy status + timestamps', async () => {
    const c = caller();
    await c.core.registry.register({
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
    });
    await c.core.registry.register({
      baseUrl: 'http://media-api:3006',
      manifest: mediaManifest(),
    });
    const res = await c.core.registry.list();
    expect(res.pillars).toHaveLength(2);
    const ids = res.pillars.map((p) => p.pillarId);
    expect(ids).toContain('finance');
    expect(ids).toContain('media');
    for (const p of res.pillars) {
      expect(p.status).toBe('healthy');
      expect(p.registeredAt).toMatch(/T/);
      expect(p.lastHeartbeatAt).toMatch(/T/);
    }
  });
});

describe('core.registry.get', () => {
  it('returns null for an unknown pillar', async () => {
    const c = caller();
    expect(await c.core.registry.get({ pillar: 'finance' })).toBeNull();
  });

  it('returns a single entry for a known pillar', async () => {
    const c = caller();
    await c.core.registry.register({
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
    });
    const entry = await c.core.registry.get({ pillar: 'finance' });
    expect(entry?.pillarId).toBe('finance');
    expect(entry?.baseUrl).toBe('http://finance-api:3004');
    expect(entry?.contract.package).toBe('@pops/finance-contract');
  });
});

describe('core.registry.deregister', () => {
  it('returns ok with removed=false for an unknown pillar (idempotent)', async () => {
    const c = caller();
    const res = await c.core.registry.deregister({ pillar: 'finance' });
    expect(res).toEqual({ ok: true, removed: false });
  });

  it('removes a registered pillar and reflects it in list/get', async () => {
    const c = caller();
    await c.core.registry.register({
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
    });
    const res = await c.core.registry.deregister({ pillar: 'finance' });
    expect(res).toEqual({ ok: true, removed: true });
    expect(await c.core.registry.get({ pillar: 'finance' })).toBeNull();
    expect((await c.core.registry.list()).pillars).toEqual([]);
  });

  it('supports an unregister + re-register cycle with a fresh registeredAt', async () => {
    const c = caller();
    const first = await c.core.registry.register({
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
    });
    if (!first.ok) throw new Error('first register should succeed');
    const firstRegisteredAt = first.registeredAt;

    await c.core.registry.deregister({ pillar: 'finance' });

    await new Promise((r) => setTimeout(r, 5));

    const second = await c.core.registry.register({
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
    });
    if (!second.ok) throw new Error('second register should succeed');
    expect(second.registeredAt).not.toBe(firstRegisteredAt);
  });
});
