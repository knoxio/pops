/**
 * Integration tests for the one-shot food → ai-pillar backfill. Seeds a raw
 * tmpdir-backed SQLite carrying the legacy `ai_inference_log` table (the table
 * was dropped from food's drizzle schema, so the backfill reads it via raw SQL
 * — see #3490) and a fake `fetch` (the network boundary) to assert the script
 * maps rows, POSTs dedupe-keyed records with the internal token, and is safe to
 * re-run.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runBackfill } from '../backfill-ai-inference.js';

import type { AiInferenceLogRow } from '../../src/worker/ai/backfill-mapping.js';

let tmpDir: string;
let dbPath: string;

const CREATE_TABLE = `CREATE TABLE ai_inference_log (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  operation text NOT NULL,
  domain text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd real NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  cached integer NOT NULL DEFAULT 0,
  context_id text,
  error_message text,
  metadata text,
  created_at text NOT NULL
)`;

const INSERT_ROW = `INSERT INTO ai_inference_log (
  provider, model, operation, domain, input_tokens, output_tokens, cost_usd,
  latency_ms, status, cached, context_id, error_message, metadata, created_at
) VALUES (
  @provider, @model, @operation, @domain, @inputTokens, @outputTokens, @costUsd,
  @latencyMs, @status, @cached, @contextId, @errorMessage, @metadata, @createdAt
)`;

function seedRows(rows: Partial<AiInferenceLogRow>[]): void {
  const handle = new Database(dbPath);
  handle.exec(CREATE_TABLE);
  const insert = handle.prepare(INSERT_ROW);
  for (const row of rows) {
    insert.run({
      provider: row.provider ?? 'claude',
      model: row.model ?? 'claude-haiku-4-5-20251001',
      operation: row.operation ?? 'recipe-extract-web-llm',
      domain: row.domain ?? 'food',
      inputTokens: row.inputTokens ?? 100,
      outputTokens: row.outputTokens ?? 20,
      costUsd: row.costUsd ?? 0.0002,
      latencyMs: row.latencyMs ?? 500,
      status: row.status ?? 'success',
      cached: row.cached ?? 0,
      contextId: row.contextId ?? 'ingest_source:1',
      errorMessage: row.errorMessage ?? null,
      metadata: row.metadata ?? JSON.stringify({ prompt_version: 'web-llm-v1.0' }),
      createdAt: row.createdAt ?? '2026-06-01T00:00:00.000Z',
    });
  }
  handle.close();
}

interface CapturedPost {
  url: string;
  token: string | null;
  body: unknown;
}

function fakeFetch(captured: CapturedPost[], ok = true): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    captured.push({
      url: String(input),
      token: headers.get('x-pops-internal-token'),
      body: init?.body == null ? null : JSON.parse(String(init.body)),
    });
    return Promise.resolve(new Response(null, { status: ok ? 200 : 500 }));
  }) as typeof fetch;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-backfill-'));
  dbPath = join(tmpDir, 'food.db');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('runBackfill', () => {
  it('posts every row to /ai-usage/record with the internal token + dedupe key', async () => {
    seedRows([{ contextId: 'ingest_source:11' }, { contextId: 'ingest_source:22' }]);
    const captured: CapturedPost[] = [];
    vi.stubGlobal('fetch', fakeFetch(captured));

    const summary = await runBackfill({
      aiApiUrl: 'http://ai-api:3008',
      token: 'secret-token',
      dryRun: false,
      sqlitePath: dbPath,
    });

    expect(summary).toMatchObject({ total: 2, posted: 2, skipped: 0, failed: 0 });
    expect(captured).toHaveLength(2);
    for (const post of captured) {
      expect(post.url).toBe('http://ai-api:3008/ai-usage/record');
      expect(post.token).toBe('secret-token');
      const body = post.body as { domain: string; metadata: Record<string, unknown> };
      expect(body.domain).toBe('food');
      expect(body.metadata['backfilled_from']).toBe('food');
      expect(String(body.metadata['dedupe_key'])).toMatch(/^food:ai_inference_log:\d+$/);
    }
  });

  it('is idempotent — a second run posts byte-identical dedupe-keyed records', async () => {
    seedRows([{ contextId: 'ingest_source:99' }]);
    const first: CapturedPost[] = [];
    vi.stubGlobal('fetch', fakeFetch(first));
    await runBackfill({ aiApiUrl: 'http://ai', token: 't', dryRun: false, sqlitePath: dbPath });

    const second: CapturedPost[] = [];
    vi.stubGlobal('fetch', fakeFetch(second));
    await runBackfill({ aiApiUrl: 'http://ai', token: 't', dryRun: false, sqlitePath: dbPath });

    expect(JSON.stringify(first[0]?.body)).toBe(JSON.stringify(second[0]?.body));
  });

  it('dry-run maps + counts without issuing any POST', async () => {
    seedRows([{}, {}, {}]);
    const captured: CapturedPost[] = [];
    vi.stubGlobal('fetch', fakeFetch(captured));

    const summary = await runBackfill({
      aiApiUrl: '',
      token: '',
      dryRun: true,
      sqlitePath: dbPath,
    });

    expect(summary).toMatchObject({ total: 3, posted: 3, failed: 0 });
    expect(captured).toHaveLength(0);
  });

  it('counts a non-2xx response as failed and sets a failure tally', async () => {
    seedRows([{}]);
    vi.stubGlobal('fetch', fakeFetch([], false));

    const summary = await runBackfill({
      aiApiUrl: 'http://ai',
      token: 't',
      dryRun: false,
      sqlitePath: dbPath,
    });

    expect(summary).toMatchObject({ total: 1, posted: 0, failed: 1 });
  });

  it('returns an empty summary when there are no rows', async () => {
    seedRows([]);
    const summary = await runBackfill({
      aiApiUrl: '',
      token: '',
      dryRun: true,
      sqlitePath: dbPath,
    });
    expect(summary).toMatchObject({ total: 0, posted: 0, skipped: 0, failed: 0 });
  });
});
