/**
 * PRD-133 — unit tests for `callClaudeWithLogging`.
 *
 * Exercises happy / error / missing-usage / missing-pricing paths
 * against a fake log sink + pricing lookup, asserting the logged row
 * shape matches what the `food.ai.logInference` mutation will receive.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callClaudeWithLogging,
  computeCostUsd,
  type LogFoodInferenceInput,
  type PricingEntry,
} from '../log-inference.js';

interface FakeSink {
  rows: LogFoodInferenceInput[];
  shouldFail: boolean;
}

function createFakeSink(): FakeSink {
  return { rows: [], shouldFail: false };
}

function logFnFor(sink: FakeSink) {
  return async (input: LogFoodInferenceInput) => {
    if (sink.shouldFail) throw new Error('log sink unavailable');
    sink.rows.push(input);
  };
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
    expect(sink.rows).toHaveLength(1);
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

    expect(sink.rows).toHaveLength(1);
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

    const row = sink.rows[0]!;
    expect(row.metadata).toMatchObject({ usage_missing: true });
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

    const row = sink.rows[0]!;
    expect(row.costUsd).toBe(0);
    expect(row.metadata).toMatchObject({ cost_missing: true });
  });

  it('swallows log-sink failures without affecting the caller', async () => {
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
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('logFoodInference failed');
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

    const row = sink.rows[0]!;
    expect(row.costUsd).toBeCloseTo(100 / 1e6 + (100 * 5) / 1e6, 8);
  });
});
