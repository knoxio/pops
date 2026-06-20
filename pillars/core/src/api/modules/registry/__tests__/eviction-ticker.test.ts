/**
 * Unit tests for the PRD-228 US-02 hard-eviction ticker.
 *
 * The ticker runs a single synchronous pass via `runEvictionTick`; the
 * tests drive that directly so we don't have to wait on a real
 * `setInterval`. Acceptance criteria covered:
 *   - external rows whose live status is `unavailable` and whose
 *     `statusUpdatedAt` is older than `EVICTION_THRESHOLD_MS` are
 *     DELETEd and a `deregistered` event is emitted with the right
 *     reason + `evictedAt`.
 *   - internal rows are NEVER evicted regardless of status / age.
 *   - rows still inside the threshold are left alone (no-op pass).
 *   - a row that never received a heartbeat is evicted with
 *     `reason: 'never-heartbeated'`; one that did is `'lost-heartbeat'`.
 *   - empty registry / nothing-to-evict is a clean no-op (no events).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, pillarRegistryService, type OpenedCoreDb } from '../../../../db/index.js';
import { registryEventBus, type RegistryEventPayload } from '../event-bus.js';
import { EVICTION_THRESHOLD_MS, runEvictionTick } from '../eviction-ticker.js';

import type { PersistableManifest } from '../../../../db/index.js';

const RECIPES_MANIFEST: PersistableManifest = {
  pillar: 'recipes',
  contract: {
    package: '@pops/recipes-contract',
    version: '0.1.0',
    tag: 'contract-recipes@v0.1.0',
  },
};

const FINANCE_MANIFEST: PersistableManifest = {
  pillar: 'finance',
  contract: {
    package: '@pops/finance-contract',
    version: '0.1.0',
    tag: 'contract-finance@v0.1.0',
  },
};

function isoMinusMs(reference: Date, ms: number): string {
  return new Date(reference.getTime() - ms).toISOString();
}

let tmpDir: string;
let coreDb: OpenedCoreDb;
let capturedEvents: RegistryEventPayload[];
let eventListener: (payload: RegistryEventPayload) => void;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-evict-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  capturedEvents = [];
  eventListener = (payload) => capturedEvents.push(payload);
  registryEventBus.on('registry:event', eventListener);
});

afterEach(() => {
  registryEventBus.off('registry:event', eventListener);
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('runEvictionTick — external pillars past the threshold', () => {
  it('DELETEs an external row whose status flipped unavailable more than 5 minutes ago and emits a deregistered event', async () => {
    const now = new Date('2026-06-13T12:00:00.000Z');
    const longAgo = isoMinusMs(now, EVICTION_THRESHOLD_MS + 30_000);
    pillarRegistryService.upsertPillarRegistration(coreDb.db, {
      baseUrl: 'http://recipes-api:4010',
      manifest: RECIPES_MANIFEST,
      now: longAgo,
      origin: 'external',
      apiKeyHash: 'deadbeef',
    });
    pillarRegistryService.applyStatusUpdates(coreDb.db, [
      {
        pillarId: 'recipes',
        status: 'unavailable',
        statusUpdatedAt: longAgo,
      },
    ]);

    const evictions = runEvictionTick(coreDb.db, { now });
    expect(evictions).toHaveLength(1);
    expect(evictions[0]).toMatchObject({
      pillarId: 'recipes',
      reason: 'never-heartbeated',
      evictedAt: now.toISOString(),
    });

    expect(pillarRegistryService.getPillarRegistration(coreDb.db, 'recipes')).toBeNull();

    const dereg = capturedEvents.filter((e) => e.event === 'deregistered');
    expect(dereg).toHaveLength(1);
    expect(dereg[0]).toMatchObject({
      pillarId: 'recipes',
      origin: 'external',
      reason: 'never-heartbeated',
      evictedAt: now.toISOString(),
    });
  });

  it('emits reason: lost-heartbeat when the row registered, heartbeated, then went unavailable', async () => {
    const now = new Date('2026-06-13T12:00:00.000Z');
    const registeredAt = isoMinusMs(now, EVICTION_THRESHOLD_MS + 120_000);
    pillarRegistryService.upsertPillarRegistration(coreDb.db, {
      baseUrl: 'http://recipes-api:4010',
      manifest: RECIPES_MANIFEST,
      now: registeredAt,
      origin: 'external',
      apiKeyHash: 'deadbeef',
    });
    pillarRegistryService.recordHeartbeat(coreDb.db, 'recipes', {
      now: isoMinusMs(now, EVICTION_THRESHOLD_MS + 60_000),
    });
    pillarRegistryService.applyStatusUpdates(coreDb.db, [
      {
        pillarId: 'recipes',
        status: 'unavailable',
        statusUpdatedAt: isoMinusMs(now, EVICTION_THRESHOLD_MS + 30_000),
      },
    ]);

    const evictions = runEvictionTick(coreDb.db, { now });
    expect(evictions).toHaveLength(1);
    expect(evictions[0].reason).toBe('lost-heartbeat');
    const dereg = capturedEvents.filter((e) => e.event === 'deregistered');
    expect(dereg[0]?.reason).toBe('lost-heartbeat');
  });
});

describe('runEvictionTick — guards', () => {
  it('never evicts internal pillars regardless of status / age', async () => {
    const now = new Date('2026-06-13T12:00:00.000Z');
    const longAgo = isoMinusMs(now, EVICTION_THRESHOLD_MS + 60_000);
    pillarRegistryService.upsertPillarRegistration(coreDb.db, {
      baseUrl: 'http://finance-api:3004',
      manifest: FINANCE_MANIFEST,
      now: longAgo,
      origin: 'internal',
    });
    pillarRegistryService.applyStatusUpdates(coreDb.db, [
      {
        pillarId: 'finance',
        status: 'unavailable',
        statusUpdatedAt: longAgo,
      },
    ]);

    const evictions = runEvictionTick(coreDb.db, { now });
    expect(evictions).toHaveLength(0);
    expect(pillarRegistryService.getPillarRegistration(coreDb.db, 'finance')).not.toBeNull();
    expect(capturedEvents.filter((e) => e.event === 'deregistered')).toHaveLength(0);
  });

  it('does not evict an external row still inside the eviction threshold', async () => {
    const now = new Date('2026-06-13T12:00:00.000Z');
    const recent = isoMinusMs(now, EVICTION_THRESHOLD_MS - 1_000);
    pillarRegistryService.upsertPillarRegistration(coreDb.db, {
      baseUrl: 'http://recipes-api:4010',
      manifest: RECIPES_MANIFEST,
      now: recent,
      origin: 'external',
      apiKeyHash: 'deadbeef',
    });
    pillarRegistryService.applyStatusUpdates(coreDb.db, [
      {
        pillarId: 'recipes',
        status: 'unavailable',
        statusUpdatedAt: recent,
      },
    ]);

    const evictions = runEvictionTick(coreDb.db, { now });
    expect(evictions).toHaveLength(0);
    expect(pillarRegistryService.getPillarRegistration(coreDb.db, 'recipes')).not.toBeNull();
  });

  it('does not evict an external row whose live status is still healthy', async () => {
    const now = new Date('2026-06-13T12:00:00.000Z');
    pillarRegistryService.upsertPillarRegistration(coreDb.db, {
      baseUrl: 'http://recipes-api:4010',
      manifest: RECIPES_MANIFEST,
      now: now.toISOString(),
      origin: 'external',
      apiKeyHash: 'deadbeef',
    });

    const evictions = runEvictionTick(coreDb.db, { now });
    expect(evictions).toHaveLength(0);
  });

  it('is a clean no-op when the registry is empty', () => {
    const now = new Date('2026-06-13T12:00:00.000Z');
    const evictions = runEvictionTick(coreDb.db, { now });
    expect(evictions).toEqual([]);
    expect(capturedEvents).toEqual([]);
  });
});
