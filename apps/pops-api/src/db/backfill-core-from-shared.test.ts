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
 *
 * Theme 13 round 2 retired the `service_accounts`, `settings`,
 * `ai_inference_daily`, and `ai_budgets` entries from `TABLE_COPIES`
 * — their writer cutovers have shipped end-to-end. Only
 * `ai_inference_log` remains on the bridge because
 * `modules/food/routers/ai.ts` still writes via the shared handle.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openCoreDb } from '@pops/core-db';

import { backfillCoreFromShared, closeCoreDb, setCoreDb } from '../db.js';
import { AI_INFERENCE_LOG_TABLE_SQL } from './backfill-test-fixtures.js';

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

interface SeedLog {
  id: number;
  provider: string;
  model: string;
  operation: string;
  createdAt: string;
}

function openSharedWithLogs(logs: SeedLog[]): string {
  const path = join(tmpDir, 'pops.db');
  const raw = new BetterSqlite3(path);
  raw.exec(AI_INFERENCE_LOG_TABLE_SQL);
  const insert = raw.prepare(
    'INSERT INTO ai_inference_log (id, provider, model, operation, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  for (const r of logs) insert.run(r.id, r.provider, r.model, r.operation, r.createdAt);
  raw.close();
  process.env['SQLITE_PATH'] = path;
  return path;
}

describe('backfillCoreFromShared', () => {
  it('returns silently when the core handle is closed', () => {
    setCoreDb(null);
    expect(() => backfillCoreFromShared()).not.toThrow();
  });

  it('copies fresh ai_inference_log rows on first run and is a no-op on the second', () => {
    openSharedWithLogs([
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
    ]);
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
    openSharedWithLogs([
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
    ]);
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

  it('tolerates a shared DB without the ai_inference_log table', () => {
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
    const count = core.raw.prepare('SELECT count(*) AS n FROM ai_inference_log').get() as {
      n: number;
    };
    expect(count.n).toBe(0);
  });

  it('carries every column across (full-shape roundtrip)', () => {
    const path = join(tmpDir, 'pops.db');
    const raw = new BetterSqlite3(path);
    raw.exec(AI_INFERENCE_LOG_TABLE_SQL);
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
