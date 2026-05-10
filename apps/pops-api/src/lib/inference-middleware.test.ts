import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setupTestContext } from '../shared/test-utils.js';
import { trackInference } from './inference-middleware.js';

import type { Database } from 'better-sqlite3';

const ctx = setupTestContext();
let db: Database;

interface LoggedRow {
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
}

function readLogs(): LoggedRow[] {
  return db.prepare('SELECT * FROM ai_inference_log ORDER BY id ASC').all() as LoggedRow[];
}

function seedClaudePricing(): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO ai_model_pricing
       (provider_id, model_id, input_cost_per_mtok, output_cost_per_mtok, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('claude', 'claude-haiku-4-5-20251001', 1, 5, now, now);
}

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe('trackInference — Anthropic-style success path', () => {
  it('logs a success row with extracted tokens, computed cost, and latency_ms > 0', async () => {
    seedClaudePricing();

    const result = await trackInference(
      {
        provider: 'claude',
        model: 'claude-haiku-4-5-20251001',
        operation: 'entity-match',
        domain: 'finance',
        contextId: 'import:42',
      },
      async () => {
        // Tiny delay so latency_ms is > 0 without slowing the suite.
        await new Promise((r) => setTimeout(r, 5));
        return { usage: { input_tokens: 1000, output_tokens: 200 }, content: 'ok' };
      }
    );

    expect(result).toEqual({ usage: { input_tokens: 1000, output_tokens: 200 }, content: 'ok' });

    const logs = readLogs();
    expect(logs).toHaveLength(1);
    const [row] = logs;
    expect(row?.provider).toBe('claude');
    expect(row?.model).toBe('claude-haiku-4-5-20251001');
    expect(row?.operation).toBe('entity-match');
    expect(row?.domain).toBe('finance');
    expect(row?.context_id).toBe('import:42');
    expect(row?.input_tokens).toBe(1000);
    expect(row?.output_tokens).toBe(200);
    // 1000 input @ $1/Mtok + 200 output @ $5/Mtok = 0.001 + 0.001 = 0.002
    expect(row?.cost_usd).toBeCloseTo(0.002, 6);
    expect(row?.status).toBe('success');
    expect(row?.cached).toBe(0);
    expect((row?.latency_ms ?? 0) > 0).toBe(true);
    expect(row?.error_message).toBeNull();
  });
});

describe('trackInference — error and timeout paths', () => {
  it('logs status=error with truncated error_message and re-throws the original error', async () => {
    const longMessage = 'x'.repeat(2000);
    const original = new Error(longMessage);

    await expect(
      trackInference(
        { provider: 'claude', model: 'claude-haiku-4-5-20251001', operation: 'entity-match' },
        async () => {
          throw original;
        }
      )
    ).rejects.toBe(original);

    const logs = readLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.status).toBe('error');
    expect(logs[0]?.error_message).toHaveLength(1000);
    expect(logs[0]?.input_tokens).toBe(0);
    expect(logs[0]?.output_tokens).toBe(0);
    expect(logs[0]?.cost_usd).toBe(0);
  });

  it('classifies AbortError as timeout', async () => {
    class AbortError extends Error {
      override name = 'AbortError';
    }

    await expect(
      trackInference(
        { provider: 'claude', model: 'claude-haiku-4-5-20251001', operation: 'entity-match' },
        async () => {
          throw new AbortError('request aborted');
        }
      )
    ).rejects.toThrow('request aborted');

    const logs = readLogs();
    expect(logs[0]?.status).toBe('timeout');
  });

  it('classifies "timeout" in error message as timeout', async () => {
    await expect(
      trackInference(
        { provider: 'claude', model: 'claude-haiku-4-5-20251001', operation: 'entity-match' },
        async () => {
          throw new Error('Request TIMEOUT after 30s');
        }
      )
    ).rejects.toThrow('TIMEOUT');

    expect(readLogs()[0]?.status).toBe('timeout');
  });
});

describe('trackInference — cached path', () => {
  it('logs cached=1 with latency_ms=0 and cost_usd=0', async () => {
    const result = await trackInference(
      {
        provider: 'claude',
        model: 'claude-haiku-4-5-20251001',
        operation: 'entity-match',
        cached: true,
      },
      async () => 'cache-hit-result'
    );

    expect(result).toBe('cache-hit-result');
    const [row] = readLogs();
    expect(row?.cached).toBe(1);
    expect(row?.latency_ms).toBe(0);
    expect(row?.cost_usd).toBe(0);
    expect(row?.status).toBe('success');
  });
});

describe('trackInference — Ollama-shaped responses', () => {
  it('reads tokens from prompt_eval_count / eval_count when present', async () => {
    await trackInference(
      { provider: 'ollama', model: 'llama3:8b', operation: 'embedding' },
      async () => ({ prompt_eval_count: 42, eval_count: 17, response: 'hello world' })
    );

    const [row] = readLogs();
    expect(row?.input_tokens).toBe(42);
    expect(row?.output_tokens).toBe(17);
    // Local model with no pricing row → cost from default pricing fallback.
    expect((row?.cost_usd ?? 0) >= 0).toBe(true);
  });

  it('estimates tokens via word-count * 1.3 when Ollama returns no counts', async () => {
    await trackInference(
      { provider: 'ollama', model: 'llama3:8b', operation: 'embedding' },
      async () => ({
        // 5 prompt words → ceil(5 * 1.3) = 7
        prompt: 'tell me a short joke',
        // 4 response words → ceil(4 * 1.3) = 6
        response: 'why did the chicken',
      })
    );

    const [row] = readLogs();
    expect(row?.input_tokens).toBe(7);
    expect(row?.output_tokens).toBe(6);
  });

  it('logs zero tokens when neither counts nor text are present', async () => {
    await trackInference(
      { provider: 'ollama', model: 'llama3:8b', operation: 'embedding' },
      async () => ({ misc: 'nothing-useful-here' })
    );

    const [row] = readLogs();
    expect(row?.input_tokens).toBe(0);
    expect(row?.output_tokens).toBe(0);
  });
});
