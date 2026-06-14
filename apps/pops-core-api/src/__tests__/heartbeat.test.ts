/**
 * Heartbeat lifecycle tests for `core.registry.*` (Theme 13 PRD-162).
 *
 * Covers the registry side of the heartbeat contract: the `heartbeat`
 * mutation, the background reconciliation ticker, the lazy-compute
 * status path on `list`/`get`, and the recovery cycle.
 *
 * Drives `appRouter.createCaller(ctx)` against a per-test in-memory
 * core.db plus an injected clock so missed heartbeats can be simulated
 * without sleeping in real time.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, pillarRegistryService, type OpenedCoreDb } from '@pops/core-db';

import {
  HEARTBEAT_INTERVAL_MS,
  HEALTHY_STALENESS_REFRESH_MS,
  UNAVAILABLE_AFTER_MS,
  injectRegistryClock,
  resetRegistryClock,
} from '../modules/registry/status.js';
import { runHeartbeatTick } from '../modules/registry/ticker.js';
import { appRouter } from '../router.js';
import { type Context } from '../trpc.js';

import type { ManifestPayload } from '@pops/pillar-sdk';

let tmpDir: string;
let coreDb: OpenedCoreDb;
let clock: { now: Date };

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-heartbeat-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  clock = { now: new Date('2026-06-12T12:00:00.000Z') };
  injectRegistryClock(() => clock.now);
});

afterEach(() => {
  resetRegistryClock();
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

function advance(ms: number): void {
  clock.now = new Date(clock.now.getTime() + ms);
}

function financeManifest(): ManifestPayload {
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
    ai: { tools: [] },
    uri: { types: ['finance/transaction'] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/healthz' },
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
    consumedSettings: { keys: [] },
    healthcheck: { path: '/healthz' },
  };
}

async function registerFinance(): Promise<string> {
  const result = await caller().core.registry.register({
    baseUrl: 'http://finance-api:3004',
    manifest: financeManifest(),
  });
  if (!result.ok) throw new Error('register fixture failed');
  return result.pillarId;
}

describe('core.registry.heartbeat (PRD-162)', () => {
  it('returns ok=false reason=not-registered for an unknown pillar', async () => {
    const res = await caller().core.registry.heartbeat({ pillar: 'finance' });
    expect(res).toEqual({ ok: false, reason: 'not-registered' });
  });

  it('updates lastHeartbeatAt to NOW() and reports statusChanged=false when already healthy', async () => {
    await registerFinance();
    const registeredAt = (await caller().core.registry.get({ pillar: 'finance' }))!.lastHeartbeatAt;

    advance(HEARTBEAT_INTERVAL_MS);
    const beforeHeartbeat = clock.now.toISOString();

    pillarRegistryService.recordHeartbeat(coreDb.db, 'finance', { now: beforeHeartbeat });

    const res = await caller().core.registry.heartbeat({ pillar: 'finance' });
    if (!res.ok) throw new Error('expected ok=true');
    expect(res.pillarId).toBe('finance');
    expect(res.status).toBe('healthy');
    expect(res.statusChanged).toBe(false);
    expect(new Date(res.lastHeartbeatAt).getTime()).toBeGreaterThanOrEqual(
      new Date(registeredAt).getTime()
    );
  });

  it('flips status back to healthy and reports statusChanged=true after an unavailable transition', async () => {
    await registerFinance();

    advance(UNAVAILABLE_AFTER_MS + 1_000);
    runHeartbeatTick(coreDb.db);

    const persisted = pillarRegistryService.getPillarRegistration(coreDb.db, 'finance');
    expect(persisted?.status).toBe('unavailable');

    advance(1_000);
    const res = await caller().core.registry.heartbeat({ pillar: 'finance' });
    if (!res.ok) throw new Error('expected ok=true');
    expect(res.status).toBe('healthy');
    expect(res.statusChanged).toBe(true);

    const back = await caller().core.registry.get({ pillar: 'finance' });
    expect(back?.status).toBe('healthy');
  });

  it('is idempotent under concurrent heartbeats — last write wins', async () => {
    await registerFinance();
    const c = caller();

    const t1 = c.core.registry.heartbeat({ pillar: 'finance' });
    const t2 = c.core.registry.heartbeat({ pillar: 'finance' });
    const t3 = c.core.registry.heartbeat({ pillar: 'finance' });
    const results = await Promise.all([t1, t2, t3]);

    for (const r of results) {
      if (!r.ok) throw new Error('expected ok=true');
      expect(r.status).toBe('healthy');
    }

    const entry = await c.core.registry.get({ pillar: 'finance' });
    expect(entry?.status).toBe('healthy');
  });
});

describe('lazy snapshot compute on list / get (PRD-162 us-03)', () => {
  it('reports unavailable on list() once age exceeds UNAVAILABLE_AFTER_MS, even before the ticker runs', async () => {
    await registerFinance();
    advance(UNAVAILABLE_AFTER_MS + 1);

    const res = await caller().core.registry.list();
    expect(res.pillars).toHaveLength(1);
    expect(res.pillars[0]?.status).toBe('unavailable');

    const persisted = pillarRegistryService.getPillarRegistration(coreDb.db, 'finance');
    expect(persisted?.status).toBe('healthy');
  });

  it('boundary: exactly UNAVAILABLE_AFTER_MS old is unavailable (boundary owned by unavailable)', async () => {
    await registerFinance();
    advance(UNAVAILABLE_AFTER_MS);

    const entry = await caller().core.registry.get({ pillar: 'finance' });
    expect(entry?.status).toBe('unavailable');
  });

  it('clock skew (lastHeartbeatAt in the future) is treated as healthy', async () => {
    await registerFinance();
    clock.now = new Date(clock.now.getTime() - 60_000);

    const entry = await caller().core.registry.get({ pillar: 'finance' });
    expect(entry?.status).toBe('healthy');
  });
});

describe('background reconciliation ticker (PRD-162 us-02)', () => {
  it('emits a healthy → unavailable transition once the heartbeat age exceeds the threshold', async () => {
    await registerFinance();
    advance(UNAVAILABLE_AFTER_MS + 1);

    const transitions: Array<{ pillarId: string; previousStatus: string; nextStatus: string }> = [];
    const result = runHeartbeatTick(coreDb.db, {
      onTransition: (t) => {
        transitions.push(t);
      },
    });

    expect(result).toHaveLength(1);
    expect(transitions).toEqual([
      expect.objectContaining({
        pillarId: 'finance',
        previousStatus: 'healthy',
        nextStatus: 'unavailable',
      }),
    ]);

    const persisted = pillarRegistryService.getPillarRegistration(coreDb.db, 'finance');
    expect(persisted?.status).toBe('unavailable');
    expect(persisted?.statusUpdatedAt).toBe(clock.now.toISOString());
  });

  it('does not emit a transition when no status changes', async () => {
    await registerFinance();
    advance(HEARTBEAT_INTERVAL_MS);

    const transitions: unknown[] = [];
    const result = runHeartbeatTick(coreDb.db, {
      onTransition: (t) => transitions.push(t),
    });

    expect(result).toEqual([]);
    expect(transitions).toEqual([]);
  });

  it('drives an unavailable → healthy transition after a heartbeat arrives', async () => {
    await registerFinance();
    advance(UNAVAILABLE_AFTER_MS + 1_000);
    runHeartbeatTick(coreDb.db);

    expect(pillarRegistryService.getPillarRegistration(coreDb.db, 'finance')?.status).toBe(
      'unavailable'
    );

    advance(1_000);
    const beat = await caller().core.registry.heartbeat({ pillar: 'finance' });
    if (!beat.ok) throw new Error('expected ok=true');

    advance(HEARTBEAT_INTERVAL_MS);
    const transitions: Array<{ pillarId: string; nextStatus: string }> = [];
    runHeartbeatTick(coreDb.db, {
      onTransition: (t) => transitions.push({ pillarId: t.pillarId, nextStatus: t.nextStatus }),
    });

    expect(transitions).toEqual([]);
    expect(pillarRegistryService.getPillarRegistration(coreDb.db, 'finance')?.status).toBe(
      'healthy'
    );
  });

  it('refreshes status_updated_at on healthy pillars once HEALTHY_STALENESS_REFRESH_MS has elapsed', async () => {
    await registerFinance();
    const before = pillarRegistryService.getPillarRegistration(coreDb.db, 'finance')!;

    advance(HEALTHY_STALENESS_REFRESH_MS + 5_000);
    pillarRegistryService.recordHeartbeat(coreDb.db, 'finance', { now: clock.now.toISOString() });

    runHeartbeatTick(coreDb.db);

    const after = pillarRegistryService.getPillarRegistration(coreDb.db, 'finance')!;
    expect(after.status).toBe('healthy');
    expect(after.statusUpdatedAt).not.toBe(before.statusUpdatedAt);
    expect(after.statusUpdatedAt).toBe(clock.now.toISOString());
  });

  it('handles many pillars: one tick emits a transition per missed pillar', async () => {
    await caller().core.registry.register({
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
    });
    await caller().core.registry.register({
      baseUrl: 'http://media-api:3006',
      manifest: mediaManifest(),
    });

    advance(UNAVAILABLE_AFTER_MS + 1);

    const transitions = runHeartbeatTick(coreDb.db);
    expect(transitions.map((t) => t.pillarId).toSorted()).toEqual(['finance', 'media']);
    for (const t of transitions) {
      expect(t.previousStatus).toBe('healthy');
      expect(t.nextStatus).toBe('unavailable');
    }
  });
});
