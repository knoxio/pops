/**
 * Boot-time registry reconciliation tests (Theme 13 PRD-164).
 *
 * Simulates the core-api restart scenario:
 *   - Persisted rows survive across boots.
 *   - `lastHeartbeatAt` reflects the pre-restart wall clock.
 *   - On boot, rows stale beyond `UNAVAILABLE_AFTER_MS` flip to
 *     `unknown`; fresher rows are left alone.
 *
 * Uses an in-memory core.db plus an explicit `now` so the test does not
 * touch the singleton clock and can run in parallel with PRD-162 tests.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, pillarRegistryService, type OpenedCoreDb } from '@pops/core-db';

import { reconcileRegistryOnBoot } from '../modules/registry/boot.js';
import { UNAVAILABLE_AFTER_MS } from '../modules/registry/status.js';

interface SeedRow {
  pillarId: string;
  baseUrl: string;
  ageMs: number;
  status: 'healthy' | 'unavailable' | 'unknown';
}

let tmpDir: string;
let coreDb: OpenedCoreDb;
const bootNow = new Date('2026-06-12T12:00:00.000Z');

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-boot-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function seedRegistration(row: SeedRow): void {
  const lastHeartbeatAt = new Date(bootNow.getTime() - row.ageMs).toISOString();
  pillarRegistryService.upsertPillarRegistration(coreDb.db, {
    baseUrl: row.baseUrl,
    manifest: {
      pillar: row.pillarId,
      contract: {
        package: `@pops/${row.pillarId}-contract`,
        version: '1.0.0',
        tag: `contract-${row.pillarId}@v1.0.0`,
      },
    },
    now: lastHeartbeatAt,
  });
  if (row.status !== 'healthy') {
    pillarRegistryService.applyStatusUpdates(coreDb.db, [
      {
        pillarId: row.pillarId,
        status: row.status,
        statusUpdatedAt: lastHeartbeatAt,
      },
    ]);
  }
}

describe('reconcileRegistryOnBoot (PRD-164)', () => {
  it('marks pillars whose lastHeartbeatAt exceeds the threshold as unknown', () => {
    seedRegistration({
      pillarId: 'finance',
      baseUrl: 'http://finance-api:3004',
      ageMs: UNAVAILABLE_AFTER_MS + 60_000,
      status: 'healthy',
    });
    seedRegistration({
      pillarId: 'media',
      baseUrl: 'http://media-api:3006',
      ageMs: 5_000,
      status: 'healthy',
    });
    seedRegistration({
      pillarId: 'recipes',
      baseUrl: 'http://recipes-api:3007',
      ageMs: UNAVAILABLE_AFTER_MS * 3,
      status: 'unavailable',
    });

    const transitions = reconcileRegistryOnBoot(coreDb.db, {
      now: bootNow,
      logger: () => {},
    });

    expect(transitions.map((t) => t.pillarId).toSorted()).toEqual(['finance', 'recipes']);
    for (const t of transitions) {
      expect(t.nextStatus).toBe('unknown');
      expect(t.at).toBe(bootNow.toISOString());
    }

    const finance = pillarRegistryService.getPillarRegistration(coreDb.db, 'finance');
    const media = pillarRegistryService.getPillarRegistration(coreDb.db, 'media');
    const recipes = pillarRegistryService.getPillarRegistration(coreDb.db, 'recipes');

    expect(finance?.status).toBe('unknown');
    expect(finance?.statusUpdatedAt).toBe(bootNow.toISOString());
    expect(media?.status).toBe('healthy');
    expect(recipes?.status).toBe('unknown');
  });

  it('is idempotent: re-running on already-unknown rows is a no-op', () => {
    seedRegistration({
      pillarId: 'finance',
      baseUrl: 'http://finance-api:3004',
      ageMs: UNAVAILABLE_AFTER_MS * 2,
      status: 'healthy',
    });

    const first = reconcileRegistryOnBoot(coreDb.db, { now: bootNow, logger: () => {} });
    expect(first).toHaveLength(1);

    const second = reconcileRegistryOnBoot(coreDb.db, { now: bootNow, logger: () => {} });
    expect(second).toHaveLength(0);
  });

  it('leaves boundary rows (exactly the threshold) untouched — only strictly stale rows flip', () => {
    seedRegistration({
      pillarId: 'finance',
      baseUrl: 'http://finance-api:3004',
      ageMs: UNAVAILABLE_AFTER_MS,
      status: 'healthy',
    });

    const transitions = reconcileRegistryOnBoot(coreDb.db, { now: bootNow, logger: () => {} });

    expect(transitions).toEqual([]);
    const persisted = pillarRegistryService.getPillarRegistration(coreDb.db, 'finance');
    expect(persisted?.status).toBe('healthy');
  });

  it('preserves lastHeartbeatAt — only status + statusUpdatedAt change', () => {
    seedRegistration({
      pillarId: 'finance',
      baseUrl: 'http://finance-api:3004',
      ageMs: UNAVAILABLE_AFTER_MS * 10,
      status: 'healthy',
    });
    const beforeHeartbeat = pillarRegistryService.getPillarRegistration(
      coreDb.db,
      'finance'
    )?.lastHeartbeatAt;

    reconcileRegistryOnBoot(coreDb.db, { now: bootNow, logger: () => {} });

    const after = pillarRegistryService.getPillarRegistration(coreDb.db, 'finance');
    expect(after?.lastHeartbeatAt).toBe(beforeHeartbeat);
    expect(after?.status).toBe('unknown');
  });

  it('respects custom staleThresholdMs', () => {
    seedRegistration({
      pillarId: 'finance',
      baseUrl: 'http://finance-api:3004',
      ageMs: 15_000,
      status: 'healthy',
    });

    const noTransitions = reconcileRegistryOnBoot(coreDb.db, {
      now: bootNow,
      staleThresholdMs: 60_000,
      logger: () => {},
    });
    expect(noTransitions).toEqual([]);

    const transitions = reconcileRegistryOnBoot(coreDb.db, {
      now: bootNow,
      staleThresholdMs: 10_000,
      logger: () => {},
    });
    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.pillarId).toBe('finance');
  });

  it('forwards each transition through the onTransition callback', () => {
    seedRegistration({
      pillarId: 'finance',
      baseUrl: 'http://finance-api:3004',
      ageMs: UNAVAILABLE_AFTER_MS * 2,
      status: 'healthy',
    });

    const seen: string[] = [];
    reconcileRegistryOnBoot(coreDb.db, {
      now: bootNow,
      onTransition: (t) => seen.push(`${t.pillarId}:${t.previousStatus}->${t.nextStatus}`),
      logger: () => {},
    });

    expect(seen).toEqual(['finance:healthy->unknown']);
  });

  it('handles an empty registry without throwing', () => {
    const transitions = reconcileRegistryOnBoot(coreDb.db, { now: bootNow, logger: () => {} });
    expect(transitions).toEqual([]);
  });
});
