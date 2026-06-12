/**
 * Tests for PlexusLifecycleManager (PRD-090, US-02; PRD-180 US-03).
 *
 * Uses an in-memory SQLite database to exercise the full registration,
 * health-check, and shutdown flows without touching disk. Post-PR3 the
 * lifecycle reads + writes both resolve through `getCerebrumDrizzle()`,
 * so the fixture wires `setCerebrumDb()` against the same in-memory
 * handle the test asserts on.
 */
import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setDb } from '../../../../db.js';
import { setCerebrumDb } from '../../../../db/cerebrum-handle.js';
import { BaseAdapter } from '../adapter.js';
import { PlexusLifecycleManager } from '../lifecycle.js';

import type { AdapterConfig, AdapterStatus, EngineData, IngestOptions } from '../types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a minimal in-memory SQLite DB with the plexus tables. */
function createTestDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE plexus_adapters (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL UNIQUE,
      status         TEXT NOT NULL DEFAULT 'registered',
      config         TEXT,
      last_health    TEXT,
      last_error     TEXT,
      ingested_count INTEGER NOT NULL DEFAULT 0,
      emitted_count  INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );
    CREATE TABLE plexus_filters (
      id          TEXT PRIMARY KEY,
      adapter_id  TEXT NOT NULL REFERENCES plexus_adapters(id) ON DELETE CASCADE,
      filter_type TEXT NOT NULL,
      field       TEXT NOT NULL,
      pattern     TEXT NOT NULL,
      enabled     INTEGER NOT NULL DEFAULT 1
    );
  `);
  return db;
}

/** A mock adapter that succeeds at everything by default. */
class MockAdapter extends BaseAdapter {
  declare readonly name: string;
  readonly version = '1.0.0';

  initializeFn = vi.fn<(config: AdapterConfig) => Promise<void>>().mockResolvedValue(undefined);
  ingestFn = vi.fn<(options: IngestOptions) => Promise<EngineData[]>>().mockResolvedValue([]);
  healthCheckFn = vi.fn<() => Promise<AdapterStatus>>().mockResolvedValue({
    status: 'healthy',
    lastChecked: new Date().toISOString(),
  });
  shutdownFn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

  constructor(adapterName = 'mock') {
    super();
    (this as { name: string }).name = adapterName;
  }

  override async initialize(config: AdapterConfig): Promise<void> {
    await super.initialize(config);
    return this.initializeFn(config);
  }

  async ingest(options: IngestOptions): Promise<EngineData[]> {
    return this.ingestFn(options);
  }

  override async healthCheck(): Promise<AdapterStatus> {
    return this.healthCheckFn();
  }

  override async shutdown(): Promise<void> {
    return this.shutdownFn();
  }
}

function defaultConfig(): AdapterConfig {
  return { name: 'mock', credentials: {}, settings: {} };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlexusLifecycleManager', () => {
  let db: BetterSqlite3.Database;
  let prevDb: BetterSqlite3.Database | null;
  let lifecycle: PlexusLifecycleManager;

  beforeEach(() => {
    db = createTestDb();
    prevDb = setDb(db);
    setCerebrumDb({ db: drizzle<Record<string, unknown>>(db), raw: db, vecAvailable: false });
    // Use a very large interval so scheduled health checks don't fire during tests.
    lifecycle = new PlexusLifecycleManager({ healthIntervalMs: 999_999_999 });
  });

  afterEach(() => {
    setCerebrumDb(null);
    if (prevDb) setDb(prevDb);
    else db.close();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  describe('register', () => {
    it('creates a DB row and transitions to healthy on success', async () => {
      const adapter = new MockAdapter();
      const row = await lifecycle.register(adapter, defaultConfig());

      expect(row.id).toBe('plx_mock');
      expect(row.name).toBe('mock');
      expect(row.status).toBe('healthy');
      expect(row.lastError).toBeNull();
      expect(adapter.initializeFn).toHaveBeenCalledOnce();
    });

    it('transitions to error when initialize() throws', async () => {
      const adapter = new MockAdapter();
      adapter.initializeFn.mockRejectedValue(new Error('connection refused'));

      const row = await lifecycle.register(adapter, defaultConfig());

      expect(row.status).toBe('error');
      expect(row.lastError).toBe('connection refused');
    });

    it('stores adapter settings in the config column', async () => {
      const adapter = new MockAdapter();
      const config: AdapterConfig = {
        name: 'mock',
        credentials: {},
        settings: { host: 'imap.example.com', port: 993 },
      };
      const row = await lifecycle.register(adapter, config);
      expect(row.config).toEqual({ host: 'imap.example.com', port: 993 });
    });
  });

  // -------------------------------------------------------------------------
  // Unregister
  // -------------------------------------------------------------------------

  describe('unregister', () => {
    it('calls shutdown() and removes the DB row', async () => {
      const adapter = new MockAdapter();
      await lifecycle.register(adapter, defaultConfig());

      const removed = await lifecycle.unregister('plx_mock');

      expect(removed).toBe(true);
      expect(adapter.shutdownFn).toHaveBeenCalledOnce();

      const row = db.prepare('SELECT * FROM plexus_adapters WHERE id = ?').get('plx_mock');
      expect(row).toBeUndefined();
    });

    it('returns false when the adapter does not exist', async () => {
      const removed = await lifecycle.unregister('plx_nonexistent');
      expect(removed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Health checks
  // -------------------------------------------------------------------------

  describe('healthCheck', () => {
    it('returns healthy when the adapter is fine', async () => {
      const adapter = new MockAdapter();
      await lifecycle.register(adapter, defaultConfig());

      const result = await lifecycle.healthCheck('plx_mock');
      expect(result.status).toBe('healthy');
      expect(result.error).toBeUndefined();
    });

    it('returns degraded after a single failure', async () => {
      const adapter = new MockAdapter();
      await lifecycle.register(adapter, defaultConfig());

      // Make health check fail.
      adapter.healthCheckFn.mockRejectedValue(new Error('timeout'));

      const result = await lifecycle.healthCheck('plx_mock');
      expect(result.status).toBe('degraded');
      expect(result.error).toBe('timeout');
    });

    it('transitions to error after 3 consecutive failures', async () => {
      const adapter = new MockAdapter();
      await lifecycle.register(adapter, defaultConfig());

      adapter.healthCheckFn.mockRejectedValue(new Error('dead'));

      await lifecycle.healthCheck('plx_mock');
      await lifecycle.healthCheck('plx_mock');
      const result = await lifecycle.healthCheck('plx_mock');

      expect(result.status).toBe('error');

      // The adapter should be removed from active set.
      expect(lifecycle.isHealthy('plx_mock')).toBe(false);
    });

    it('resets failure count on successful health check', async () => {
      const adapter = new MockAdapter();
      await lifecycle.register(adapter, defaultConfig());

      // Fail twice.
      adapter.healthCheckFn.mockRejectedValue(new Error('flaky'));
      await lifecycle.healthCheck('plx_mock');
      await lifecycle.healthCheck('plx_mock');

      // Recover.
      adapter.healthCheckFn.mockResolvedValue({
        status: 'healthy',
        lastChecked: new Date().toISOString(),
      });
      const result = await lifecycle.healthCheck('plx_mock');
      expect(result.status).toBe('healthy');

      // Subsequent failure should be degraded, not error.
      adapter.healthCheckFn.mockRejectedValue(new Error('flaky again'));
      const after = await lifecycle.healthCheck('plx_mock');
      expect(after.status).toBe('degraded');
    });

    it('returns error for an unknown adapter', async () => {
      const result = await lifecycle.healthCheck('plx_nonexistent');
      expect(result.status).toBe('error');
      expect(result.error).toContain('not active');
    });
  });

  // -------------------------------------------------------------------------
  // isHealthy
  // -------------------------------------------------------------------------

  describe('isHealthy', () => {
    it('returns true for a healthy registered adapter', async () => {
      const adapter = new MockAdapter();
      await lifecycle.register(adapter, defaultConfig());
      expect(lifecycle.isHealthy('plx_mock')).toBe(true);
    });

    it('returns false for an unknown adapter', () => {
      expect(lifecycle.isHealthy('plx_nonexistent')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Error isolation
  // -------------------------------------------------------------------------

  describe('error isolation', () => {
    it('one adapter failing does not affect another', async () => {
      const a = new MockAdapter('alpha');
      const b = new MockAdapter('beta');

      await lifecycle.register(a, { name: 'alpha', credentials: {}, settings: {} });
      await lifecycle.register(b, { name: 'beta', credentials: {}, settings: {} });

      // Adapter A fails health checks 3 times → error.
      a.healthCheckFn.mockRejectedValue(new Error('crash'));
      await lifecycle.healthCheck('plx_alpha');
      await lifecycle.healthCheck('plx_alpha');
      await lifecycle.healthCheck('plx_alpha');

      // Adapter B should still be healthy.
      expect(lifecycle.isHealthy('plx_alpha')).toBe(false);
      expect(lifecycle.isHealthy('plx_beta')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Shutdown
  // -------------------------------------------------------------------------

  describe('shutdownAll', () => {
    it('calls shutdown() on all active adapters', async () => {
      const a = new MockAdapter();
      const b = new MockAdapter('other');

      await lifecycle.register(a, defaultConfig());
      await lifecycle.register(b, { name: 'other', credentials: {}, settings: {} });

      await lifecycle.shutdownAll();

      expect(a.shutdownFn).toHaveBeenCalledOnce();
      expect(b.shutdownFn).toHaveBeenCalledOnce();
      expect(lifecycle.getActiveAdapterIds()).toHaveLength(0);
    });

    it('continues shutting down even if one adapter throws', async () => {
      const a = new MockAdapter();
      a.shutdownFn.mockRejectedValue(new Error('shutdown error'));

      const b = new MockAdapter('other');

      await lifecycle.register(a, defaultConfig());
      await lifecycle.register(b, { name: 'other', credentials: {}, settings: {} });

      // Should not throw.
      await lifecycle.shutdownAll();
      expect(b.shutdownFn).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Sync
  // -------------------------------------------------------------------------

  describe('sync', () => {
    it('calls ingest and returns counts', async () => {
      const adapter = new MockAdapter();
      adapter.ingestFn.mockResolvedValue([
        { body: 'item 1', source: '' },
        { body: 'item 2', source: '' },
      ]);

      await lifecycle.register(adapter, defaultConfig());
      const result = await lifecycle.sync('plx_mock');

      expect(result.ingested).toBe(2);
      expect(result.filtered).toBe(0);

      // Check the DB counter was updated.
      const row = db
        .prepare('SELECT ingested_count FROM plexus_adapters WHERE id = ?')
        .get('plx_mock') as { ingested_count: number };
      expect(row.ingested_count).toBe(2);
    });

    it('stamps source field on ingested items', async () => {
      const adapter = new MockAdapter();
      const items: EngineData[] = [{ body: 'test', source: '' }];
      adapter.ingestFn.mockResolvedValue(items);

      await lifecycle.register(adapter, defaultConfig());
      await lifecycle.sync('plx_mock');

      expect(items[0]?.source).toBe('plexus:mock');
    });

    it('throws when adapter is not active', async () => {
      await expect(lifecycle.sync('plx_nonexistent')).rejects.toThrow('not active');
    });
  });
});
