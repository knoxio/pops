/**
 * Boot-time backfill tests for `backfillCoreFromShared` (phase 2 PR 3).
 *
 * Exercises the ATTACH-based copy from the shared `pops.db` to the
 * pillar's `core.db` against on-disk SQLite files (in-memory DBs can't
 * be ATTACHed). Confirms:
 *   - first run carries existing rows across,
 *   - second run is a no-op (idempotent — the WHERE filter dedupes),
 *   - mixed state (some rows already in core) only inserts the missing ones,
 *   - missing source table is tolerated without throwing.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openCoreDb } from '@pops/core-db';

import { backfillCoreFromShared, closeCoreDb, setCoreDb } from '../db.js';
import {
  AI_BUDGETS_TABLE_SQL,
  AI_INFERENCE_DAILY_TABLE_SQL,
  AI_INFERENCE_LOG_TABLE_SQL,
  SERVICE_ACCOUNTS_TABLE_SQL,
  SETTINGS_TABLE_SQL,
} from './backfill-test-fixtures.js';

let tmpDir: string;

const originalSharedPath = process.env['SQLITE_PATH'];

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-backfill-'));
});

afterEach(() => {
  closeCoreDb();
  rmSync(tmpDir, { recursive: true, force: true });
  if (originalSharedPath === undefined) delete process.env['SQLITE_PATH'];
  else process.env['SQLITE_PATH'] = originalSharedPath;
});

function openSharedWithRows(rows: { id: string; name: string }[]): string {
  const path = join(tmpDir, 'pops.db');
  // Create the shared file via openCoreDb's helper would conflict because
  // openCoreDb applies the core migrations; instead seed a raw SQLite
  // with the canonical service_accounts DDL + the test rows.
  const raw = new BetterSqlite3(path);
  raw.exec(SERVICE_ACCOUNTS_TABLE_SQL);
  const insert = raw.prepare(
    `INSERT INTO service_accounts (id, name, key_prefix, key_hash) VALUES (?, ?, ?, ?)`
  );
  for (const row of rows) {
    insert.run(row.id, row.name, `pfx${row.id.slice(0, 5)}`, 'scrypt$x$y');
  }
  raw.close();
  process.env['SQLITE_PATH'] = path;
  return path;
}

describe('backfillCoreFromShared', () => {
  it('returns silently when the core handle is closed', () => {
    setCoreDb(null);
    expect(() => backfillCoreFromShared()).not.toThrow();
  });

  it('copies fresh rows on first run and is a no-op on the second', () => {
    openSharedWithRows([
      { id: 'sa_a', name: 'alpha' },
      { id: 'sa_b', name: 'beta' },
    ]);
    const core = openCoreDb(join(tmpDir, 'core.db'));
    setCoreDb(core);

    backfillCoreFromShared();
    const after = core.raw.prepare('SELECT id, name FROM service_accounts ORDER BY id').all() as {
      id: string;
      name: string;
    }[];
    expect(after.map((r) => r.id)).toEqual(['sa_a', 'sa_b']);

    backfillCoreFromShared();
    const second = core.raw.prepare('SELECT count(*) AS n FROM service_accounts').get() as {
      n: number;
    };
    expect(second.n).toBe(2);
  });

  it('only inserts rows missing from the core copy', () => {
    openSharedWithRows([
      { id: 'sa_a', name: 'alpha' },
      { id: 'sa_b', name: 'beta' },
    ]);
    const core = openCoreDb(join(tmpDir, 'core.db'));
    setCoreDb(core);
    core.raw
      .prepare(`INSERT INTO service_accounts (id, name, key_prefix, key_hash) VALUES (?, ?, ?, ?)`)
      .run('sa_b', 'beta-old', 'pfxBB', 'scrypt$x$y');

    backfillCoreFromShared();
    const rows = core.raw.prepare('SELECT id, name FROM service_accounts ORDER BY id').all() as {
      id: string;
      name: string;
    }[];
    expect(rows).toEqual([
      { id: 'sa_a', name: 'alpha' },
      { id: 'sa_b', name: 'beta-old' },
    ]);
  });

  it('tolerates a shared DB without the service_accounts table', () => {
    const path = join(tmpDir, 'pops.db');
    const raw = new BetterSqlite3(path);
    raw.close();
    process.env['SQLITE_PATH'] = path;

    const core = openCoreDb(join(tmpDir, 'core.db'));
    setCoreDb(core);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(() => backfillCoreFromShared()).not.toThrow();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    const count = core.raw.prepare('SELECT count(*) AS n FROM service_accounts').get() as {
      n: number;
    };
    expect(count.n).toBe(0);
  });

  describe('settings (PRD-183 PR 1)', () => {
    function openSharedWithSettings(rows: { key: string; value: string }[]): string {
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
      raw.exec(SERVICE_ACCOUNTS_TABLE_SQL);
      raw.exec(SETTINGS_TABLE_SQL);
      const insert = raw.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
      for (const row of rows) insert.run(row.key, row.value);
      raw.close();
      process.env['SQLITE_PATH'] = path;
      return path;
    }

    it('copies fresh settings rows on first run and is a no-op on the second', () => {
      openSharedWithSettings([
        { key: 'ui.theme', value: 'dark' },
        { key: 'ai.model', value: 'sonnet' },
      ]);
      const core = openCoreDb(join(tmpDir, 'core.db'));
      setCoreDb(core);

      backfillCoreFromShared();
      const after = core.raw.prepare('SELECT key, value FROM settings ORDER BY key').all() as {
        key: string;
        value: string;
      }[];
      expect(after).toEqual([
        { key: 'ai.model', value: 'sonnet' },
        { key: 'ui.theme', value: 'dark' },
      ]);

      backfillCoreFromShared();
      const second = core.raw.prepare('SELECT count(*) AS n FROM settings').get() as {
        n: number;
      };
      expect(second.n).toBe(2);
    });

    it('only inserts settings rows missing from the core copy (preserves existing values)', () => {
      openSharedWithSettings([
        { key: 'ui.theme', value: 'dark' },
        { key: 'ai.model', value: 'sonnet' },
      ]);
      const core = openCoreDb(join(tmpDir, 'core.db'));
      setCoreDb(core);
      core.raw
        .prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
        .run('ui.theme', 'pre-existing-value');

      backfillCoreFromShared();
      const rows = core.raw.prepare('SELECT key, value FROM settings ORDER BY key').all() as {
        key: string;
        value: string;
      }[];
      expect(rows).toEqual([
        { key: 'ai.model', value: 'sonnet' },
        { key: 'ui.theme', value: 'pre-existing-value' },
      ]);
    });

    it('tolerates a shared DB without the settings table', () => {
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
      raw.exec(SERVICE_ACCOUNTS_TABLE_SQL);
      raw.close();
      process.env['SQLITE_PATH'] = path;

      const core = openCoreDb(join(tmpDir, 'core.db'));
      setCoreDb(core);

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        expect(() => backfillCoreFromShared()).not.toThrow();
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
      const count = core.raw.prepare('SELECT count(*) AS n FROM settings').get() as {
        n: number;
      };
      expect(count.n).toBe(0);
    });

    it('carries every column across (full-shape roundtrip)', () => {
      openSharedWithSettings([
        { key: 'ai.modelOverrides.query', value: 'haiku' },
        { key: 'cerebrum.auditor.contradictionModel', value: 'opus' },
      ]);
      const core = openCoreDb(join(tmpDir, 'core.db'));
      setCoreDb(core);

      backfillCoreFromShared();
      const row = core.raw
        .prepare('SELECT key, value FROM settings WHERE key = ?')
        .get('ai.modelOverrides.query') as { key: string; value: string };
      expect(row).toEqual({ key: 'ai.modelOverrides.query', value: 'haiku' });
    });
  });

  describe('ai-usage (PRD-186 PR 1)', () => {
    interface InferenceLogRow {
      id: number;
      provider: string;
      model: string;
      operation: string;
      domain: string | null;
      input_tokens: number;
      output_tokens: number;
      cost_usd: number;
      latency_ms: number;
      status: string;
      cached: number;
      context_id: string | null;
      error_message: string | null;
      metadata: string | null;
      created_at: string;
    }

    function openSharedWithAiUsage(opts: {
      logs?: {
        id: number;
        provider: string;
        model: string;
        operation: string;
        createdAt: string;
      }[];
      daily?: {
        id: number;
        date: string;
        provider: string;
        model: string;
        operation: string;
        totalCalls: number;
      }[];
      budgets?: { id: string; scopeType: string; action: string }[];
    }): string {
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
      raw.exec(SERVICE_ACCOUNTS_TABLE_SQL);
      raw.exec(AI_INFERENCE_LOG_TABLE_SQL);
      raw.exec(AI_INFERENCE_DAILY_TABLE_SQL);
      raw.exec(AI_BUDGETS_TABLE_SQL);
      if (opts.logs) {
        const stmt = raw.prepare(
          'INSERT INTO ai_inference_log (id, provider, model, operation, created_at) VALUES (?, ?, ?, ?, ?)'
        );
        for (const r of opts.logs) stmt.run(r.id, r.provider, r.model, r.operation, r.createdAt);
      }
      if (opts.daily) {
        const stmt = raw.prepare(
          'INSERT INTO ai_inference_daily (id, date, provider, model, operation, total_calls) VALUES (?, ?, ?, ?, ?, ?)'
        );
        for (const r of opts.daily)
          stmt.run(r.id, r.date, r.provider, r.model, r.operation, r.totalCalls);
      }
      if (opts.budgets) {
        const stmt = raw.prepare(
          'INSERT INTO ai_budgets (id, scope_type, action, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        );
        const now = '2026-06-01T00:00:00.000Z';
        for (const r of opts.budgets) stmt.run(r.id, r.scopeType, r.action, now, now);
      }
      raw.close();
      process.env['SQLITE_PATH'] = path;
      return path;
    }

    it('copies fresh ai_inference_log rows on first run and is a no-op on the second', () => {
      openSharedWithAiUsage({
        logs: [
          {
            id: 1,
            provider: 'claude',
            model: 'sonnet',
            operation: 'classify',
            createdAt: '2026-06-01T00:00:00.000Z',
          },
          {
            id: 2,
            provider: 'openai',
            model: 'gpt-4',
            operation: 'embed',
            createdAt: '2026-06-02T00:00:00.000Z',
          },
        ],
      });
      const core = openCoreDb(join(tmpDir, 'core.db'));
      setCoreDb(core);

      backfillCoreFromShared();
      const after = core.raw
        .prepare('SELECT id, provider, operation FROM ai_inference_log ORDER BY id')
        .all() as { id: number; provider: string; operation: string }[];
      expect(after).toEqual([
        { id: 1, provider: 'claude', operation: 'classify' },
        { id: 2, provider: 'openai', operation: 'embed' },
      ]);

      backfillCoreFromShared();
      const second = core.raw.prepare('SELECT count(*) AS n FROM ai_inference_log').get() as {
        n: number;
      };
      expect(second.n).toBe(2);
    });

    it('only inserts ai_inference_log rows missing from the core copy', () => {
      openSharedWithAiUsage({
        logs: [
          {
            id: 1,
            provider: 'claude',
            model: 'sonnet',
            operation: 'classify',
            createdAt: '2026-06-01T00:00:00.000Z',
          },
          {
            id: 2,
            provider: 'openai',
            model: 'gpt-4',
            operation: 'embed',
            createdAt: '2026-06-02T00:00:00.000Z',
          },
        ],
      });
      const core = openCoreDb(join(tmpDir, 'core.db'));
      setCoreDb(core);
      core.raw
        .prepare(
          'INSERT INTO ai_inference_log (id, provider, model, operation, created_at) VALUES (?, ?, ?, ?, ?)'
        )
        .run(2, 'pre-existing', 'pre-existing', 'pre-existing', '2026-06-02T00:00:00.000Z');

      backfillCoreFromShared();
      const rows = core.raw
        .prepare('SELECT id, provider FROM ai_inference_log ORDER BY id')
        .all() as { id: number; provider: string }[];
      expect(rows).toEqual([
        { id: 1, provider: 'claude' },
        { id: 2, provider: 'pre-existing' },
      ]);
    });

    it('copies ai_inference_daily aggregate rows across', () => {
      openSharedWithAiUsage({
        daily: [
          {
            id: 1,
            date: '2026-05-01',
            provider: 'claude',
            model: 'sonnet',
            operation: 'classify',
            totalCalls: 10,
          },
        ],
      });
      const core = openCoreDb(join(tmpDir, 'core.db'));
      setCoreDb(core);

      backfillCoreFromShared();
      const row = core.raw
        .prepare('SELECT date, provider, total_calls FROM ai_inference_daily WHERE id = 1')
        .get() as { date: string; provider: string; total_calls: number };
      expect(row).toEqual({ date: '2026-05-01', provider: 'claude', total_calls: 10 });
    });

    it('copies ai_budgets rows across and preserves the unique id constraint', () => {
      openSharedWithAiUsage({
        budgets: [
          { id: 'global', scopeType: 'global', action: 'warn' },
          { id: 'claude', scopeType: 'provider', action: 'block' },
        ],
      });
      const core = openCoreDb(join(tmpDir, 'core.db'));
      setCoreDb(core);

      backfillCoreFromShared();
      const rows = core.raw
        .prepare('SELECT id, scope_type, action FROM ai_budgets ORDER BY id')
        .all() as { id: string; scope_type: string; action: string }[];
      expect(rows).toEqual([
        { id: 'claude', scope_type: 'provider', action: 'block' },
        { id: 'global', scope_type: 'global', action: 'warn' },
      ]);
    });

    it('tolerates a shared DB without the ai_inference_log / ai_budgets tables', () => {
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
      raw.exec(SERVICE_ACCOUNTS_TABLE_SQL);
      raw.close();
      process.env['SQLITE_PATH'] = path;

      const core = openCoreDb(join(tmpDir, 'core.db'));
      setCoreDb(core);

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        expect(() => backfillCoreFromShared()).not.toThrow();
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
      const logCount = core.raw.prepare('SELECT count(*) AS n FROM ai_inference_log').get() as {
        n: number;
      };
      const budgetCount = core.raw.prepare('SELECT count(*) AS n FROM ai_budgets').get() as {
        n: number;
      };
      expect(logCount.n).toBe(0);
      expect(budgetCount.n).toBe(0);
    });

    it('carries every column across (full-shape roundtrip)', () => {
      const path = join(tmpDir, 'pops.db');
      const raw = new BetterSqlite3(path);
      raw.exec(SERVICE_ACCOUNTS_TABLE_SQL);
      raw.exec(AI_INFERENCE_LOG_TABLE_SQL);
      raw.exec(AI_INFERENCE_DAILY_TABLE_SQL);
      raw.exec(AI_BUDGETS_TABLE_SQL);
      raw
        .prepare(
          `INSERT INTO ai_inference_log
            (id, provider, model, operation, domain, input_tokens, output_tokens, cost_usd,
             latency_ms, status, cached, context_id, error_message, metadata, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          42,
          'claude',
          'sonnet',
          'classify',
          'finance',
          1000,
          500,
          0.0123,
          250,
          'success',
          1,
          'ctx_abc',
          null,
          '{"k":"v"}',
          '2026-06-03T10:11:12.000Z'
        );
      raw.close();
      process.env['SQLITE_PATH'] = path;

      const core = openCoreDb(join(tmpDir, 'core.db'));
      setCoreDb(core);

      backfillCoreFromShared();
      const row = core.raw
        .prepare('SELECT * FROM ai_inference_log WHERE id = 42')
        .get() as InferenceLogRow;
      expect(row).toEqual({
        id: 42,
        provider: 'claude',
        model: 'sonnet',
        operation: 'classify',
        domain: 'finance',
        input_tokens: 1000,
        output_tokens: 500,
        cost_usd: 0.0123,
        latency_ms: 250,
        status: 'success',
        cached: 1,
        context_id: 'ctx_abc',
        error_message: null,
        metadata: '{"k":"v"}',
        created_at: '2026-06-03T10:11:12.000Z',
      });
    });
  });
});
