/**
 * PRD-133 — unit tests for `callClaudeWithLogging`.
 *
 * Exercises happy / error / missing-usage / missing-pricing /
 * cost-cap / fire-and-forget paths against a fake log sink + pricing
 * lookup. The wrapper schedules log writes as detached promises so
 * each assertion flushes the microtask queue before reading
 * `sink.rows` — `vi.waitFor` keeps the wait bounded.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callClaudeWithLogging,
  computeCostUsd,
  logFoodInference,
  type LogFoodInferenceInput,
  type PricingEntry,
} from '../log-inference.js';

interface FakeSink {
  rows: LogFoodInferenceInput[];
  shouldFail: boolean;
  resolveAfterMs: number;
}

function createFakeSink(): FakeSink {
  return { rows: [], shouldFail: false, resolveAfterMs: 0 };
}

function logFnFor(sink: FakeSink) {
  return async (input: LogFoodInferenceInput) => {
    if (sink.resolveAfterMs > 0) {
      await new Promise<void>((r) => setTimeout(r, sink.resolveAfterMs));
    }
    if (sink.shouldFail) throw new Error('log sink unavailable');
    sink.rows.push(input);
  };
}

async function waitForRows(sink: FakeSink, expected: number): Promise<void> {
  await vi.waitFor(() => {
    if (sink.rows.length < expected)
      throw new Error(`expected ${expected}, have ${sink.rows.length}`);
  });
}

const claudePricing: PricingEntry = { input: 1.0, output: 5.0 };

describe('computeCostUsd', () => {
  it('multiplies tokens by per-million pricing', () => {
    const result = computeCostUsd(1_500_000, 500_000, claudePricing);
    expect(result.missing).toBe(false);
    expect(result.costUsd).toBeCloseTo(1.5 + 2.5, 6);
  });

  it('returns missing=true with cost=0 when pricing is null', () => {
    const result = computeCostUsd(1000, 1000, null);
    expect(result).toEqual({ costUsd: 0, missing: true });
  });
});

describe('logFoodInference (default sink)', () => {
  it('no-ops when POPS_API_URL is unset', async () => {
    const before = process.env['POPS_API_URL'];
    delete process.env['POPS_API_URL'];
    try {
      await expect(
        logFoodInference({
          operation: 'recipe-extract-text',
          contextId: 'ingest_source:1',
          provider: 'claude',
          model: 'claude-haiku-4-5-20251001',
          promptVersion: 'text-v0.1',
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs: 0,
          status: 'success',
          cached: false,
        })
      ).resolves.toBeUndefined();
    } finally {
      if (before !== undefined) process.env['POPS_API_URL'] = before;
    }
  });
});

describe('callClaudeWithLogging', () => {
  let sink: FakeSink;

  beforeEach(() => {
    sink = createFakeSink();
  });

  it('logs a success row + returns the underlying response', async () => {
    const response = await callClaudeWithLogging<{ dsl: string }>(
      {
        operation: 'recipe-extract-web-llm',
        contextId: 'ingest_source:42',
        model: 'claude-haiku-4-5-20251001',
        promptVersion: 'web-llm-v0.1',
        metadata: { url: 'https://example.com/recipe' },
        call: async () => ({
          response: { dsl: '@recipe("foo", "Foo")' },
          usage: { inputTokens: 1500, outputTokens: 600 },
        }),
      },
      {
        log: logFnFor(sink),
        lookupPricing: () => claudePricing,
      }
    );

    expect(response).toEqual({ dsl: '@recipe("foo", "Foo")' });
    await waitForRows(sink, 1);
    const row = sink.rows[0]!;
    expect(row.status).toBe('success');
    expect(row.operation).toBe('recipe-extract-web-llm');
    expect(row.contextId).toBe('ingest_source:42');
    expect(row.inputTokens).toBe(1500);
    expect(row.outputTokens).toBe(600);
    expect(row.cached).toBe(false);
    expect(row.costUsd).toBeCloseTo(1500 / 1e6 + (600 * 5) / 1e6, 8);
    expect(row.latencyMs).toBeGreaterThanOrEqual(0);
    expect(row.metadata).toMatchObject({
      prompt_version: 'web-llm-v0.1',
      url: 'https://example.com/recipe',
    });
    expect(row.metadata).not.toHaveProperty('cost_missing');
    expect(row.metadata).not.toHaveProperty('usage_missing');
    expect(row.metadata).not.toHaveProperty('over_cost_cap');
  });

  it('logs an error row + rethrows when the underlying call throws', async () => {
    await expect(
      callClaudeWithLogging(
        {
          operation: 'recipe-extract-ig-vision',
          contextId: 'ingest_source:7',
          model: 'claude-haiku-4-5-20251001',
          promptVersion: 'ig-vision-v0.1',
          call: async () => {
            throw new Error('Anthropic 529 overloaded');
          },
        },
        {
          log: logFnFor(sink),
          lookupPricing: () => claudePricing,
        }
      )
    ).rejects.toThrow('Anthropic 529 overloaded');

    await waitForRows(sink, 1);
    const row = sink.rows[0]!;
    expect(row.status).toBe('error');
    expect(row.errorMessage).toBe('Anthropic 529 overloaded');
    expect(row.inputTokens).toBe(0);
    expect(row.outputTokens).toBe(0);
    expect(row.costUsd).toBe(0);
  });

  it('flags usage_missing in metadata when both token counts are zero', async () => {
    await callClaudeWithLogging(
      {
        operation: 'recipe-extract-screenshot',
        contextId: 'ingest_source:1',
        model: 'claude-haiku-4-5-20251001',
        promptVersion: 'screenshot-v0.1',
        call: async () => ({
          response: { dsl: '' },
          usage: { inputTokens: 0, outputTokens: 0 },
        }),
      },
      {
        log: logFnFor(sink),
        lookupPricing: () => claudePricing,
      }
    );

    await waitForRows(sink, 1);
    expect(sink.rows[0]!.metadata).toMatchObject({ usage_missing: true });
  });

  it('flags cost_missing when the pricing lookup returns null', async () => {
    await callClaudeWithLogging(
      {
        operation: 'recipe-extract-text',
        contextId: 'ingest_source:2',
        model: 'claude-future-unknown',
        promptVersion: 'text-v0.1',
        call: async () => ({
          response: { dsl: '@recipe("bar", "Bar")' },
          usage: { inputTokens: 500, outputTokens: 300 },
        }),
      },
      {
        log: logFnFor(sink),
        lookupPricing: () => null,
      }
    );

    await waitForRows(sink, 1);
    const row = sink.rows[0]!;
    expect(row.costUsd).toBe(0);
    expect(row.metadata).toMatchObject({ cost_missing: true });
  });

  it('flags over_cost_cap + emits a warning when costUsd exceeds the cap (does NOT abort)', async () => {
    const warn = vi.fn();
    // Pricing × tokens gives ~0.500 USD — well over the 0.05 default cap.
    const response = await callClaudeWithLogging<{ dsl: string }>(
      {
        operation: 'recipe-extract-ig-vision',
        contextId: 'ingest_source:9',
        model: 'claude-haiku-4-5-20251001',
        promptVersion: 'ig-vision-v0.1',
        costCapUsd: 0.05,
        call: async () => ({
          response: { dsl: '@recipe("big", "Big")' },
          usage: { inputTokens: 500_000, outputTokens: 0 },
        }),
      },
      {
        log: logFnFor(sink),
        lookupPricing: () => claudePricing,
        warn,
      }
    );

    expect(response).toEqual({ dsl: '@recipe("big", "Big")' });
    await waitForRows(sink, 1);
    const row = sink.rows[0]!;
    expect(row.metadata).toMatchObject({ over_cost_cap: true });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('exceeds cap');
  });

  it('returns to the caller WITHOUT waiting for the log sink (fire-and-forget)', async () => {
    sink.resolveAfterMs = 200;
    const start = Date.now();
    const response = await callClaudeWithLogging<{ ok: true }>(
      {
        operation: 'recipe-extract-text',
        contextId: 'ingest_source:3',
        model: 'claude-haiku-4-5-20251001',
        promptVersion: 'text-v0.1',
        call: async () => ({
          response: { ok: true },
          usage: { inputTokens: 100, outputTokens: 200 },
        }),
      },
      { log: logFnFor(sink), lookupPricing: () => claudePricing }
    );

    const elapsed = Date.now() - start;
    expect(response).toEqual({ ok: true });
    // Wrapper returned WAY before the sink's 200ms delay.
    expect(elapsed).toBeLessThan(150);
    // But the row eventually lands.
    await waitForRows(sink, 1);
  });

  it('swallows log-sink failures via warn without affecting the caller', async () => {
    sink.shouldFail = true;
    const warn = vi.fn();

    const response = await callClaudeWithLogging<{ ok: true }>(
      {
        operation: 'recipe-extract-text',
        contextId: 'ingest_source:3',
        model: 'claude-haiku-4-5-20251001',
        promptVersion: 'text-v0.1',
        call: async () => ({
          response: { ok: true },
          usage: { inputTokens: 100, outputTokens: 200 },
        }),
      },
      {
        log: logFnFor(sink),
        lookupPricing: () => claudePricing,
        warn,
      }
    );

    expect(response).toEqual({ ok: true });
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalled();
    });
    const calls = warn.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('logFoodInference failed')
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('awaits an async pricing lookup', async () => {
    await callClaudeWithLogging(
      {
        operation: 'recipe-extract-web-llm',
        contextId: 'ingest_source:99',
        model: 'claude-haiku-4-5-20251001',
        promptVersion: 'web-llm-v0.1',
        call: async () => ({
          response: { dsl: '' },
          usage: { inputTokens: 100, outputTokens: 100 },
        }),
      },
      {
        log: logFnFor(sink),
        lookupPricing: async () => claudePricing,
      }
    );

    await waitForRows(sink, 1);
    expect(sink.rows[0]!.costUsd).toBeCloseTo(100 / 1e6 + (100 * 5) / 1e6, 8);
  });
});
