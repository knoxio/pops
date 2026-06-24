/**
 * Heartbeat lifecycle tests for the registry (heartbeat-lifecycle).
 *
 * Covers the registry side of the heartbeat contract: `recordHeartbeat`, the
 * background reconciliation ticker, the lazy-compute status path on the
 * discovery snapshot, and the recovery cycle.
 *
 * Drives `pillarRegistryService` + `buildRegistrySnapshot` against a per-test
 * in-memory core.db plus an injected clock so missed heartbeats can be
 * simulated without sleeping in real time. (The heartbeat wire route itself is
 * covered over HTTP in `external-heartbeat.test.ts`.)
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, pillarRegistryService, type OpenedCoreDb } from '../../db/index.js';
import { buildRegistrySnapshot } from '../modules/registry/snapshot.js';
import {
  HEARTBEAT_INTERVAL_MS,
  HEALTHY_STALENESS_REFRESH_MS,
  UNAVAILABLE_AFTER_MS,
  injectRegistryClock,
  resetRegistryClock,
} from '../modules/registry/status.js';
import { runHeartbeatTick } from '../modules/registry/ticker.js';

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

function nowIso(): string {
  return clock.now.toISOString();
}

function advance(ms: number): void {
  clock.now = new Date(clock.now.getTime() + ms);
}

function heartbeat(pillar: string): ReturnType<typeof pillarRegistryService.recordHeartbeat> {
  return pillarRegistryService.recordHeartbeat(coreDb.db, pillar, { now: nowIso() });
}

function snapshotEntry(
  pillar: string
): ReturnType<typeof buildRegistrySnapshot>['pillars'][number] | undefined {
  return buildRegistrySnapshot(coreDb.db).pillars.find((p) => p.pillarId === pillar);
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
    search: { adapters: [] },
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
    routes: { queries: ['media.library.list'], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: ['media/movie'] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/healthz' },
  };
}

function registerFinance(): string {
  pillarRegistryService.upsertPillarRegistration(coreDb.db, {
    baseUrl: 'http://finance-api:3004',
    manifest: financeManifest(),
    now: nowIso(),
  });
  return 'finance';
}

describe('registry heartbeat', () => {
  it('returns recorded=false for an unknown pillar', () => {
    const res = heartbeat('finance');
    expect(res.recorded).toBe(false);
    expect(res.registration).toBeNull();
  });

  it('updates lastHeartbeatAt to NOW() and reports statusChanged=false when already healthy', () => {
    registerFinance();
    const registeredAt = snapshotEntry('finance')!.lastHeartbeatAt;

    advance(HEARTBEAT_INTERVAL_MS);
    const res = heartbeat('finance');
    expect(res.recorded).toBe(true);
    expect(res.registration?.pillarId).toBe('finance');
    expect(res.statusChanged).toBe(false);
    expect(snapshotEntry('finance')?.status).toBe('healthy');
    expect(new Date(res.registration!.lastHeartbeatAt).getTime()).toBeGreaterThanOrEqual(
      new Date(registeredAt).getTime()
    );
  });

  it('flips status back to healthy and reports statusChanged=true after an unavailable transition', () => {
    registerFinance();

    advance(UNAVAILABLE_AFTER_MS + 1_000);
    runHeartbeatTick(coreDb.db);

    const persisted = pillarRegistryService.getPillarRegistration(coreDb.db, 'finance');
    expect(persisted?.status).toBe('unavailable');

    advance(1_000);
    const res = heartbeat('finance');
    expect(res.recorded).toBe(true);
    expect(res.registration?.status).toBe('healthy');
    expect(res.statusChanged).toBe(true);

    expect(snapshotEntry('finance')?.status).toBe('healthy');
  });

  it('is idempotent under repeated heartbeats — last write wins', () => {
    registerFinance();

    for (let i = 0; i < 3; i += 1) {
      const r = heartbeat('finance');
      expect(r.recorded).toBe(true);
    }

    expect(snapshotEntry('finance')?.status).toBe('healthy');
  });
});

describe('lazy snapshot compute', () => {
  it('reports unavailable on the snapshot once age exceeds UNAVAILABLE_AFTER_MS, even before the ticker runs', () => {
    registerFinance();
    advance(UNAVAILABLE_AFTER_MS + 1);

    const snapshot = buildRegistrySnapshot(coreDb.db);
    expect(snapshot.pillars).toHaveLength(1);
    expect(snapshot.pillars[0]?.status).toBe('unavailable');

    const persisted = pillarRegistryService.getPillarRegistration(coreDb.db, 'finance');
    expect(persisted?.status).toBe('healthy');
  });

  it('boundary: exactly UNAVAILABLE_AFTER_MS old is unavailable (boundary owned by unavailable)', () => {
    registerFinance();
    advance(UNAVAILABLE_AFTER_MS);

    expect(snapshotEntry('finance')?.status).toBe('unavailable');
  });

  it('clock skew (lastHeartbeatAt in the future) is treated as healthy', () => {
    registerFinance();
    clock.now = new Date(clock.now.getTime() - 60_000);

    expect(snapshotEntry('finance')?.status).toBe('healthy');
  });
});

describe('background reconciliation ticker', () => {
  it('emits a healthy → unavailable transition once the heartbeat age exceeds the threshold', () => {
    registerFinance();
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

  it('does not emit a transition when no status changes', () => {
    registerFinance();
    advance(HEARTBEAT_INTERVAL_MS);

    const transitions: unknown[] = [];
    const result = runHeartbeatTick(coreDb.db, {
      onTransition: (t) => transitions.push(t),
    });

    expect(result).toEqual([]);
    expect(transitions).toEqual([]);
  });

  it('drives an unavailable → healthy transition after a heartbeat arrives', () => {
    registerFinance();
    advance(UNAVAILABLE_AFTER_MS + 1_000);
    runHeartbeatTick(coreDb.db);

    expect(pillarRegistryService.getPillarRegistration(coreDb.db, 'finance')?.status).toBe(
      'unavailable'
    );

    advance(1_000);
    const beat = heartbeat('finance');
    expect(beat.recorded).toBe(true);

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

  it('refreshes status_updated_at on healthy pillars once HEALTHY_STALENESS_REFRESH_MS has elapsed', () => {
    registerFinance();
    const before = pillarRegistryService.getPillarRegistration(coreDb.db, 'finance')!;

    advance(HEALTHY_STALENESS_REFRESH_MS + 5_000);
    pillarRegistryService.recordHeartbeat(coreDb.db, 'finance', { now: clock.now.toISOString() });

    runHeartbeatTick(coreDb.db);

    const after = pillarRegistryService.getPillarRegistration(coreDb.db, 'finance')!;
    expect(after.status).toBe('healthy');
    expect(after.statusUpdatedAt).not.toBe(before.statusUpdatedAt);
    expect(after.statusUpdatedAt).toBe(clock.now.toISOString());
  });

  it('handles many pillars: one tick emits a transition per missed pillar', () => {
    pillarRegistryService.upsertPillarRegistration(coreDb.db, {
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
      now: nowIso(),
    });
    pillarRegistryService.upsertPillarRegistration(coreDb.db, {
      baseUrl: 'http://media-api:3006',
      manifest: mediaManifest(),
      now: nowIso(),
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
