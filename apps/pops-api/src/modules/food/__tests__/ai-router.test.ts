/**
 * PRD-133 — integration tests for `food.ai.logInference`.
 *
 * The writer routes through the core pillar handle (Theme 13 PR4
 * unblock), so the test opens a fresh per-pillar core DB via
 * `openCoreDb(':memory:')` and asserts against that. The shared handle
 * is still swapped because the tRPC context resolution touches it.
 */
import BetterSqlite3, { type Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '@pops/core-db';

import { closeDb, setCoreDb, setDb } from '../../../db.js';
import { appRouter } from '../../../router.js';

import type { Context } from '../../../trpc.js';

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

let sharedDb: Database;
let coreHandle: OpenedCoreDb | null = null;

beforeEach(() => {
  sharedDb = new BetterSqlite3(':memory:');
  sharedDb.pragma('foreign_keys = ON');
  setDb(sharedDb);
  coreHandle = openCoreDb(':memory:');
  setCoreDb(coreHandle);
});

afterEach(() => {
  setCoreDb(null);
  coreHandle?.raw.close();
  coreHandle = null;
  closeDb();
});

function readRows(): LoggedRow[] {
  if (!coreHandle) throw new Error('core handle not initialised');
  return coreHandle.raw
    .prepare('SELECT * FROM ai_inference_log ORDER BY id ASC')
    .all() as LoggedRow[];
}

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

    const rows = readRows();
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

    const rows = readRows();
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

    expect(readRows()).toHaveLength(0);
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
