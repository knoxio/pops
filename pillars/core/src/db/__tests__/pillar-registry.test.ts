/**
 * Invariant tests for the pillar-registry service against an in-memory
 * SQLite seeded with the canonical `pillar_registry` migration. Pure DB
 * + service layer — no tRPC, no Express.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyStatusUpdates,
  deletePillarRegistration,
  getPillarRegistration,
  listPillarRegistrations,
  recordHeartbeat,
  upsertPillarRegistration,
  type PersistableManifest,
} from '../services/pillar-registry.js';

import type { CoreDb } from '../services/internal.js';

const MIGRATION_PATHS = [
  join(__dirname, '../../../migrations/0055_pillar_registry.sql'),
  join(__dirname, '../../../migrations/0058_pillar_registry_external_origin.sql'),
];

function freshDb(): CoreDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const path of MIGRATION_PATHS) {
    const sql = readFileSync(path, 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim();
      if (trimmed.length > 0) raw.exec(trimmed);
    }
  }
  return drizzle(raw);
}

function financeManifest(): PersistableManifest {
  return {
    pillar: 'finance',
    contract: {
      package: '@pops/finance-contract',
      version: '1.2.3',
      tag: 'contract-finance@v1.2.3',
    },
  };
}

function mediaManifest(): PersistableManifest {
  return {
    pillar: 'media',
    contract: {
      package: '@pops/media-contract',
      version: '0.5.0',
      tag: 'contract-media@v0.5.0',
    },
  };
}

describe('upsertPillarRegistration', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts a new pillar with status=healthy and identical timestamps', () => {
    const now = '2026-06-12T12:00:00.000Z';
    const reg = upsertPillarRegistration(db, {
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
      now,
    });
    expect(reg).toMatchObject({
      pillarId: 'finance',
      baseUrl: 'http://finance-api:3004',
      contractPackage: '@pops/finance-contract',
      contractVersion: '1.2.3',
      contractTag: 'contract-finance@v1.2.3',
      registeredAt: now,
      lastHeartbeatAt: now,
      status: 'healthy',
      statusUpdatedAt: now,
    });
    expect(reg.manifest).toEqual(financeManifest());
  });

  it('re-registering the same pillar preserves registeredAt and refreshes everything else', () => {
    const first = '2026-06-12T12:00:00.000Z';
    const second = '2026-06-12T13:30:00.000Z';
    upsertPillarRegistration(db, {
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
      now: first,
    });
    const updated = upsertPillarRegistration(db, {
      baseUrl: 'http://finance-api:9999',
      manifest: {
        pillar: 'finance',
        contract: {
          package: '@pops/finance-contract',
          version: '2.0.0',
          tag: 'contract-finance@v2.0.0',
        },
      },
      now: second,
    });
    expect(updated.registeredAt).toBe(first);
    expect(updated.lastHeartbeatAt).toBe(second);
    expect(updated.statusUpdatedAt).toBe(second);
    expect(updated.baseUrl).toBe('http://finance-api:9999');
    expect(updated.contractVersion).toBe('2.0.0');
    expect(updated.contractTag).toBe('contract-finance@v2.0.0');
  });

  it('stores the manifest blob as parsable JSON', () => {
    const now = '2026-06-12T12:00:00.000Z';
    const richManifest = {
      ...financeManifest(),
      extras: { nested: { values: [1, 2, 3] } },
    } satisfies PersistableManifest & { extras: unknown };
    upsertPillarRegistration(db, {
      baseUrl: 'http://finance-api:3004',
      manifest: richManifest,
      now,
    });
    const back = getPillarRegistration(db, 'finance');
    expect(back?.manifest).toEqual(richManifest);
  });
});

describe('getPillarRegistration', () => {
  it('returns null for an unknown pillar', () => {
    const db = freshDb();
    expect(getPillarRegistration(db, 'finance')).toBeNull();
  });

  it('returns the persisted row for a known pillar', () => {
    const db = freshDb();
    upsertPillarRegistration(db, {
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
    });
    expect(getPillarRegistration(db, 'finance')?.pillarId).toBe('finance');
  });
});

describe('listPillarRegistrations', () => {
  it('returns an empty array when no pillars are registered', () => {
    expect(listPillarRegistrations(freshDb())).toEqual([]);
  });

  it('returns every registered pillar, ordered by pillarId', () => {
    const db = freshDb();
    upsertPillarRegistration(db, {
      baseUrl: 'http://media-api:3006',
      manifest: mediaManifest(),
    });
    upsertPillarRegistration(db, {
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
    });
    const rows = listPillarRegistrations(db);
    expect(rows.map((r) => r.pillarId)).toEqual(['finance', 'media']);
  });
});

describe('deletePillarRegistration', () => {
  it('returns false for an unknown pillar (idempotent)', () => {
    expect(deletePillarRegistration(freshDb(), 'finance')).toBe(false);
  });

  it('removes a registered pillar and returns true', () => {
    const db = freshDb();
    upsertPillarRegistration(db, {
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
    });
    expect(deletePillarRegistration(db, 'finance')).toBe(true);
    expect(getPillarRegistration(db, 'finance')).toBeNull();
  });

  it('re-registering after delete starts a fresh registeredAt', () => {
    const db = freshDb();
    const first = '2026-06-12T12:00:00.000Z';
    const second = '2026-06-12T14:00:00.000Z';
    upsertPillarRegistration(db, {
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
      now: first,
    });
    deletePillarRegistration(db, 'finance');
    const reg = upsertPillarRegistration(db, {
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
      now: second,
    });
    expect(reg.registeredAt).toBe(second);
  });
});

describe('recordHeartbeat', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns recorded=false for an unknown pillar (does NOT auto-create rows)', () => {
    const result = recordHeartbeat(db, 'finance', { now: '2026-06-12T12:00:00.000Z' });
    expect(result.recorded).toBe(false);
    expect(result.registration).toBeNull();
    expect(getPillarRegistration(db, 'finance')).toBeNull();
  });

  it('refreshes lastHeartbeatAt and leaves status_updated_at alone when already healthy', () => {
    const registeredAt = '2026-06-12T12:00:00.000Z';
    upsertPillarRegistration(db, {
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
      now: registeredAt,
    });
    const beat = '2026-06-12T12:00:10.000Z';
    const result = recordHeartbeat(db, 'finance', { now: beat });
    expect(result.recorded).toBe(true);
    expect(result.previousStatus).toBe('healthy');
    expect(result.statusChanged).toBe(false);
    expect(result.registration?.lastHeartbeatAt).toBe(beat);
    expect(result.registration?.statusUpdatedAt).toBe(registeredAt);
  });

  it('flips status back to healthy when previously unavailable, stamping status_updated_at', () => {
    const registeredAt = '2026-06-12T12:00:00.000Z';
    upsertPillarRegistration(db, {
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
      now: registeredAt,
    });
    applyStatusUpdates(db, [
      { pillarId: 'finance', status: 'unavailable', statusUpdatedAt: '2026-06-12T12:00:30.000Z' },
    ]);
    expect(getPillarRegistration(db, 'finance')?.status).toBe('unavailable');

    const beat = '2026-06-12T12:00:35.000Z';
    const result = recordHeartbeat(db, 'finance', { now: beat });
    expect(result.statusChanged).toBe(true);
    expect(result.previousStatus).toBe('unavailable');
    expect(result.registration?.status).toBe('healthy');
    expect(result.registration?.statusUpdatedAt).toBe(beat);
    expect(result.registration?.lastHeartbeatAt).toBe(beat);
  });
});

describe('applyStatusUpdates', () => {
  let db: CoreDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('is a no-op when given an empty list', () => {
    expect(() => applyStatusUpdates(db, [])).not.toThrow();
  });

  it('writes one status row per update inside a single transaction', () => {
    upsertPillarRegistration(db, {
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
      now: '2026-06-12T12:00:00.000Z',
    });
    upsertPillarRegistration(db, {
      baseUrl: 'http://media-api:3006',
      manifest: mediaManifest(),
      now: '2026-06-12T12:00:00.000Z',
    });
    const now = '2026-06-12T12:00:30.000Z';
    applyStatusUpdates(db, [
      { pillarId: 'finance', status: 'unavailable', statusUpdatedAt: now },
      { pillarId: 'media', status: 'unavailable', statusUpdatedAt: now },
    ]);
    expect(getPillarRegistration(db, 'finance')?.status).toBe('unavailable');
    expect(getPillarRegistration(db, 'media')?.status).toBe('unavailable');
  });

  it('silently skips updates that target an unknown pillar', () => {
    upsertPillarRegistration(db, {
      baseUrl: 'http://finance-api:3004',
      manifest: financeManifest(),
      now: '2026-06-12T12:00:00.000Z',
    });
    expect(() =>
      applyStatusUpdates(db, [
        { pillarId: 'ghost', status: 'unavailable', statusUpdatedAt: '2026-06-12T12:00:30.000Z' },
      ])
    ).not.toThrow();
    expect(getPillarRegistration(db, 'ghost')).toBeNull();
    expect(getPillarRegistration(db, 'finance')?.status).toBe('healthy');
  });
});
