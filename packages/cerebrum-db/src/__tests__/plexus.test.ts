/**
 * Invariant tests for the plexus data-access service against an in-memory
 * SQLite seeded with the package-local plexus baseline migration. Covers
 * adapter CRUD + name-conflict handling, status / health / counter
 * mutators, FK-cascade behaviour on delete, filter listing + atomic
 * replacement, and JSON config envelope round-tripping (including the
 * corrupt-blob tolerance in `parseAdapterConfig`).
 *
 * The baseline is read from
 * `packages/cerebrum-db/migrations/0053_plexus_baseline.sql` so the table
 * shape under test is identical to the one shipped in the journal.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { plexusAdapters, plexusFilters } from '../schema.js';
import {
  PlexusAdapterNameConflictError,
  PlexusAdapterNotFoundError,
} from '../services/plexus-errors.js';
import { parseAdapterConfig } from '../services/plexus-helpers.js';
import {
  deleteAdapter,
  getAdapter,
  getAdapterByName,
  getAdapterOrThrow,
  incrementAdapterCounter,
  listAdapters,
  listEnabledFilters,
  listFilters,
  recordAdapterHealth,
  setFilters,
  updateAdapterStatus,
  upsertAdapter,
} from '../services/plexus.js';

import type { CerebrumDb } from '../services/internal.js';
import type { UpsertAdapterArgs } from '../services/plexus-types.js';

const PLEXUS_MIGRATION = join(__dirname, '../../migrations/0053_plexus_baseline.sql');

function freshDb(): CerebrumDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const sql = readFileSync(PLEXUS_MIGRATION, 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) raw.exec(trimmed);
  }
  return drizzle(raw);
}

function makeUpsert(
  overrides: Partial<UpsertAdapterArgs> & Pick<UpsertAdapterArgs, 'id' | 'name'>
): UpsertAdapterArgs {
  return {
    config: { token: 'secret' },
    createdAt: '2026-06-10T10:00:00Z',
    updatedAt: '2026-06-10T10:00:00Z',
    ...overrides,
  };
}

describe('upsertAdapter', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts a new adapter with status="registered" and stringified config', () => {
    const adapter = upsertAdapter(db, makeUpsert({ id: 'adp_notion', name: 'notion' }));
    expect(adapter.id).toBe('adp_notion');
    expect(adapter.status).toBe('registered');
    expect(adapter.config).toEqual({ token: 'secret' });

    const row = db.select().from(plexusAdapters).where(eq(plexusAdapters.id, 'adp_notion')).get();
    expect(row?.config).toBe('{"token":"secret"}');
  });

  it('stores null config as SQL NULL (not the string "null")', () => {
    upsertAdapter(db, makeUpsert({ id: 'adp_null', name: 'null-cfg', config: null }));
    const row = db.select().from(plexusAdapters).where(eq(plexusAdapters.id, 'adp_null')).get();
    expect(row?.config).toBeNull();
  });

  it('re-upserting the same id resets status, clears last_error, overwrites config', () => {
    upsertAdapter(db, makeUpsert({ id: 'adp_x', name: 'x' }));
    updateAdapterStatus(db, 'adp_x', {
      status: 'error',
      updatedAt: '2026-06-10T11:00:00Z',
      lastError: 'boom',
    });

    const refreshed = upsertAdapter(
      db,
      makeUpsert({
        id: 'adp_x',
        name: 'x',
        config: { token: 'rotated' },
        updatedAt: '2026-06-10T12:00:00Z',
      })
    );
    expect(refreshed.status).toBe('registered');
    expect(refreshed.lastError).toBeNull();
    expect(refreshed.config).toEqual({ token: 'rotated' });
    expect(refreshed.updatedAt).toBe('2026-06-10T12:00:00Z');
  });

  it('raises PlexusAdapterNameConflictError when a different id owns the same name', () => {
    upsertAdapter(db, makeUpsert({ id: 'adp_a', name: 'duplicate' }));
    expect(() => upsertAdapter(db, makeUpsert({ id: 'adp_b', name: 'duplicate' }))).toThrowError(
      PlexusAdapterNameConflictError
    );
  });

  it('re-upserting the same id with a new name persists the rename', () => {
    upsertAdapter(db, makeUpsert({ id: 'adp_rename', name: 'original' }));
    const renamed = upsertAdapter(
      db,
      makeUpsert({ id: 'adp_rename', name: 'updated', updatedAt: '2026-06-10T13:00:00Z' })
    );
    expect(renamed.name).toBe('updated');
    expect(getAdapterByName(db, 'updated')?.id).toBe('adp_rename');
    expect(getAdapterByName(db, 'original')).toBeNull();
  });
});

describe('getAdapter / getAdapterOrThrow / getAdapterByName', () => {
  it('getAdapter returns null when the row is missing', () => {
    expect(getAdapter(freshDb(), 'missing')).toBeNull();
  });

  it('getAdapterOrThrow raises PlexusAdapterNotFoundError when missing', () => {
    expect(() => getAdapterOrThrow(freshDb(), 'missing')).toThrowError(PlexusAdapterNotFoundError);
  });

  it('getAdapterByName resolves the row registered under that name', () => {
    const db = freshDb();
    upsertAdapter(db, makeUpsert({ id: 'adp_n', name: 'notion' }));
    expect(getAdapterByName(db, 'notion')?.id).toBe('adp_n');
    expect(getAdapterByName(db, 'missing')).toBeNull();
  });
});

describe('listAdapters', () => {
  it('returns rows ordered by name ascending', () => {
    const db = freshDb();
    upsertAdapter(db, makeUpsert({ id: 'adp_z', name: 'zeta' }));
    upsertAdapter(db, makeUpsert({ id: 'adp_a', name: 'alpha' }));
    upsertAdapter(db, makeUpsert({ id: 'adp_m', name: 'mu' }));

    const adapters = listAdapters(db);
    expect(adapters.map((a) => a.name)).toEqual(['alpha', 'mu', 'zeta']);
  });
});

describe('updateAdapterStatus', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
    upsertAdapter(db, makeUpsert({ id: 'adp_s', name: 's' }));
  });

  it('patches status, lastError and updatedAt', () => {
    const updated = updateAdapterStatus(db, 'adp_s', {
      status: 'degraded',
      updatedAt: '2026-06-10T11:00:00Z',
      lastError: 'flaky',
    });
    expect(updated?.status).toBe('degraded');
    expect(updated?.lastError).toBe('flaky');
    expect(updated?.updatedAt).toBe('2026-06-10T11:00:00Z');
  });

  it('clears lastError when called without an error field', () => {
    updateAdapterStatus(db, 'adp_s', {
      status: 'error',
      updatedAt: '2026-06-10T11:00:00Z',
      lastError: 'first',
    });
    const cleared = updateAdapterStatus(db, 'adp_s', {
      status: 'healthy',
      updatedAt: '2026-06-10T12:00:00Z',
    });
    expect(cleared?.lastError).toBeNull();
    expect(cleared?.status).toBe('healthy');
  });

  it('returns null when the adapter no longer exists', () => {
    expect(
      updateAdapterStatus(db, 'missing', { status: 'healthy', updatedAt: '2026-06-10T11:00:00Z' })
    ).toBeNull();
  });
});

describe('recordAdapterHealth + incrementAdapterCounter', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
    upsertAdapter(db, makeUpsert({ id: 'adp_c', name: 'c' }));
  });

  it('recordAdapterHealth bumps last_health and updated_at to the same timestamp', () => {
    const updated = recordAdapterHealth(db, 'adp_c', '2026-06-10T13:00:00Z');
    expect(updated?.lastHealth).toBe('2026-06-10T13:00:00Z');
    expect(updated?.updatedAt).toBe('2026-06-10T13:00:00Z');
  });

  it('incrementAdapterCounter bumps the named counter atomically', () => {
    incrementAdapterCounter(db, 'adp_c', {
      counter: 'ingestedCount',
      delta: 3,
      updatedAt: '2026-06-10T13:00:00Z',
    });
    incrementAdapterCounter(db, 'adp_c', {
      counter: 'ingestedCount',
      delta: 2,
      updatedAt: '2026-06-10T13:05:00Z',
    });
    incrementAdapterCounter(db, 'adp_c', {
      counter: 'emittedCount',
      delta: 7,
      updatedAt: '2026-06-10T13:10:00Z',
    });

    const row = getAdapter(db, 'adp_c');
    expect(row?.ingestedCount).toBe(5);
    expect(row?.emittedCount).toBe(7);
    expect(row?.updatedAt).toBe('2026-06-10T13:10:00Z');
  });
});

describe('deleteAdapter', () => {
  it('returns 0 when the adapter is missing (idempotent)', () => {
    expect(deleteAdapter(freshDb(), 'missing')).toBe(0);
  });

  it('removes the adapter and cascades to its filters', () => {
    const db = freshDb();
    upsertAdapter(db, makeUpsert({ id: 'adp_d', name: 'd' }));
    setFilters(db, 'adp_d', [{ filterType: 'include', field: 'title', pattern: '.*' }]);

    expect(deleteAdapter(db, 'adp_d')).toBe(1);
    expect(getAdapter(db, 'adp_d')).toBeNull();
    expect(listFilters(db, 'adp_d')).toEqual([]);

    const orphans = db
      .select()
      .from(plexusFilters)
      .where(eq(plexusFilters.adapterId, 'adp_d'))
      .all();
    expect(orphans).toEqual([]);
  });
});

describe('setFilters + listFilters + listEnabledFilters', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
    upsertAdapter(db, makeUpsert({ id: 'adp_f', name: 'f' }));
  });

  it('raises PlexusAdapterNotFoundError when the parent adapter is missing', () => {
    expect(() =>
      setFilters(db, 'missing', [{ filterType: 'include', field: 't', pattern: '.*' }])
    ).toThrowError(PlexusAdapterNotFoundError);
  });

  it('replaces the filter set atomically and assigns deterministic ids', () => {
    setFilters(db, 'adp_f', [
      { filterType: 'include', field: 'title', pattern: '.*urgent.*' },
      { filterType: 'exclude', field: 'body', pattern: '.*spam.*', enabled: false },
    ]);

    const filters = listFilters(db, 'adp_f');
    expect(filters.map((f) => f.id)).toEqual(['pxf_adp_f_0', 'pxf_adp_f_1']);
    expect(filters[0]?.enabled).toBe(true);
    expect(filters[1]?.enabled).toBe(false);
  });

  it('an empty replacement deletes every filter for the adapter', () => {
    setFilters(db, 'adp_f', [{ filterType: 'include', field: 'title', pattern: '.*' }]);
    expect(listFilters(db, 'adp_f')).toHaveLength(1);

    setFilters(db, 'adp_f', []);
    expect(listFilters(db, 'adp_f')).toEqual([]);
  });

  it('listEnabledFilters only returns rows with enabled=1', () => {
    setFilters(db, 'adp_f', [
      { filterType: 'include', field: 'a', pattern: '.*', enabled: true },
      { filterType: 'include', field: 'b', pattern: '.*', enabled: false },
      { filterType: 'exclude', field: 'c', pattern: '.*' },
    ]);
    const enabled = listEnabledFilters(db, 'adp_f');
    expect(enabled.map((f) => f.field).toSorted()).toEqual(['a', 'c']);
  });
});

describe('parseAdapterConfig', () => {
  it('returns null for null, empty string and unparseable JSON', () => {
    expect(parseAdapterConfig(null)).toBeNull();
    expect(parseAdapterConfig('')).toBeNull();
    expect(parseAdapterConfig('not-json')).toBeNull();
  });

  it('returns null when the parsed value is not a plain object', () => {
    expect(parseAdapterConfig('[]')).toBeNull();
    expect(parseAdapterConfig('"a string"')).toBeNull();
    expect(parseAdapterConfig('42')).toBeNull();
  });

  it('round-trips a JSON object envelope', () => {
    expect(parseAdapterConfig('{"k":"v"}')).toEqual({ k: 'v' });
  });
});
