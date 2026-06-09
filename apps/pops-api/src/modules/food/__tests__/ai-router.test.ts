/**
 * PRD-133 — integration tests for `food.ai.logInference`.
 *
 * In-memory SQLite seeded with the ai_inference_log table. Internal
 * caller token gates the mutation; public callers must be rejected.
 */
import BetterSqlite3, { type Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, setDb } from '../../../db.js';
import { appRouter } from '../../../router.js';

import type { Context } from '../../../trpc.js';

function createAiInferenceLogTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_inference_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      operation TEXT NOT NULL,
      domain TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      cached INTEGER NOT NULL DEFAULT 0,
      context_id TEXT,
      error_message TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

function createInternalCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = { user: null, serviceAccount: null, internalCaller: true };
  return appRouter.createCaller(ctx);
}

function createPublicCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: { email: 'test@example.com' },
    serviceAccount: null,
    internalCaller: false,
  };
  return appRouter.createCaller(ctx);
}

interface LoggedRow {
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

function readRows(db: Database): LoggedRow[] {
  return db.prepare('SELECT * FROM ai_inference_log ORDER BY id ASC').all() as LoggedRow[];
}

let db: Database;

beforeEach(() => {
  db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
  createAiInferenceLogTable(db);
  setDb(db);
});

afterEach(() => {
  closeDb();
});

describe('food.ai.logInference', () => {
  it('writes a success row with domain=food and merged metadata', async () => {
    const caller = createInternalCaller();
    const result = await caller.food.ai.logInference({
      operation: 'recipe-extract-web-llm',
      contextId: 'ingest_source:42',
      provider: 'claude',
      model: 'claude-haiku-4-5-20251001',
      promptVersion: 'web-llm-v0.1',
      inputTokens: 1500,
      outputTokens: 800,
      costUsd: 0.0055,
      latencyMs: 1234,
      status: 'success',
      cached: false,
      metadata: { source_kind: 'url-web' },
    });

    expect(result).toEqual({ ok: true });

    const rows = readRows(db);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.domain).toBe('food');
    expect(row.operation).toBe('recipe-extract-web-llm');
    expect(row.context_id).toBe('ingest_source:42');
    expect(row.input_tokens).toBe(1500);
    expect(row.output_tokens).toBe(800);
    expect(row.cost_usd).toBeCloseTo(0.0055);
    expect(row.latency_ms).toBe(1234);
    expect(row.status).toBe('success');
    expect(row.cached).toBe(0);
    expect(row.error_message).toBeNull();
    const meta = JSON.parse(row.metadata ?? '{}') as Record<string, unknown>;
    expect(meta['prompt_version']).toBe('web-llm-v0.1');
    expect(meta['source_kind']).toBe('url-web');
  });

  it('writes an error row with the provided errorMessage', async () => {
    const caller = createInternalCaller();
    await caller.food.ai.logInference({
      operation: 'recipe-extract-screenshot',
      contextId: 'ingest_source:7',
      provider: 'claude',
      model: 'claude-haiku-4-5-20251001',
      promptVersion: 'screenshot-v0.1',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: 200,
      status: 'error',
      cached: false,
      errorMessage: 'Anthropic 529 overloaded',
      metadata: { cost_missing: true },
    });

    const rows = readRows(db);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.status).toBe('error');
    expect(row.error_message).toBe('Anthropic 529 overloaded');
    const meta = JSON.parse(row.metadata ?? '{}') as Record<string, unknown>;
    expect(meta['cost_missing']).toBe(true);
  });

  it('rejects public (non-internal) callers with UNAUTHORIZED', async () => {
    const caller = createPublicCaller();
    await expect(
      caller.food.ai.logInference({
        operation: 'recipe-extract-text',
        contextId: 'ingest_source:1',
        provider: 'claude',
        model: 'claude-haiku-4-5-20251001',
        promptVersion: 'text-v0.1',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.0001,
        latencyMs: 100,
        status: 'success',
        cached: false,
      })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(readRows(db)).toHaveLength(0);
  });

  it('rejects invalid operation strings at the schema boundary', async () => {
    const caller = createInternalCaller();
    await expect(
      caller.food.ai.logInference({
        operation: 'recipe-extract-bogus' as never,
        contextId: 'ingest_source:1',
        provider: 'claude',
        model: 'claude-haiku-4-5-20251001',
        promptVersion: 'v',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: 0,
        status: 'success',
        cached: false,
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
