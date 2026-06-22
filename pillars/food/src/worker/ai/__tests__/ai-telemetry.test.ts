/**
 * Telemetry-migration tests for the food worker's Claude callers that route
 * through `@pops/ai-telemetry`'s `callWithLogging`. The Anthropic SDK is the
 * only mock (the network boundary; tests MUST NOT reach a real API); the
 * wrapper runs for real with an injected fake `report` + `lookupPricing`, so
 * these assert each call site reports usage to the ai pillar with the right
 * `operation`/`domain`/`provider`, keeps the raw recipe text out of telemetry,
 * and returns its result unchanged.
 *
 * `text.test.ts` (recipe-extract-text / recipe-extract-ig-text-fallback) and
 * `web-llm.test.ts` (recipe-extract-web-llm) cover the other two operations.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __setFoodTelemetryDepsForTests,
  ANTHROPIC_PROVIDER,
  FOOD_DOMAIN,
} from '../ai-telemetry-deps.js';
import { __setAnthropicClientForTests } from '../anthropic-client.js';

import type { InferenceRecord, PricingEntry } from '@pops/ai-telemetry';

import type {
  AnthropicLike as IgAnthropicLike,
  AnthropicMessage as IgMessage,
} from '../../handlers/instagram/anthropic-client.js';
import type {
  AnthropicLike as ScreenshotAnthropicLike,
  AnthropicMessage as ScreenshotMessage,
} from '../anthropic-client.js';

const PRICING: PricingEntry = { input: 1, output: 5 };

let records: InferenceRecord[];
let resolveNext: ((record: InferenceRecord) => void) | undefined;

/** Resolves once the fire-and-forget telemetry report lands. */
function nextRecord(): Promise<InferenceRecord> {
  return new Promise<InferenceRecord>((resolve) => {
    if (records.length > 0) {
      resolve(records[records.length - 1]!);
      return;
    }
    resolveNext = resolve;
  });
}

const RECIPE_JSON = JSON.stringify({
  title: 'Test Recipe',
  servings: 2,
  ingredients: [
    {
      ingredient_slug: 'flour',
      variant_slug: null,
      prep_state_slug: null,
      qty: 200,
      unit: 'g',
      notes: null,
    },
  ],
  steps: [{ body: 'Mix everything.', duration_min: null, temperature_c: null }],
});

beforeEach(() => {
  records = [];
  resolveNext = undefined;
  __setFoodTelemetryDepsForTests({
    lookupPricing: () => Promise.resolve(PRICING),
    report: (record) => {
      records.push(record);
      resolveNext?.(record);
      return Promise.resolve();
    },
  });
});

afterEach(() => {
  __setFoodTelemetryDepsForTests(null);
  __setAnthropicClientForTests(null);
});

describe('screenshot vision — telemetry', () => {
  it('reports a recipe-extract-screenshot success record and returns the result unchanged', async () => {
    const { extractWithClaudeVision } = await import('../anthropic-client.js');
    const message: ScreenshotMessage = {
      content: [{ type: 'text', text: RECIPE_JSON }],
      usage: { input_tokens: 321, output_tokens: 88 },
      model: 'claude-haiku-4-5-20251001',
    } as ScreenshotMessage;
    const client: ScreenshotAnthropicLike = {
      messages: { create: () => Promise.resolve(message) },
    };
    __setAnthropicClientForTests(client);

    const result = await extractWithClaudeVision({
      mimeType: 'image/png',
      base64: 'ZmFrZQ==',
      prompt: 'extract',
      model: 'claude-haiku-4-5-20251001',
    });

    expect(result.text).toContain('Test Recipe');
    expect(result.inputTokens).toBe(321);
    expect(result.outputTokens).toBe(88);

    const record = await nextRecord();
    expect(record.operation).toBe('recipe-extract-screenshot');
    expect(record.domain).toBe(FOOD_DOMAIN);
    expect(record.provider).toBe(ANTHROPIC_PROVIDER);
    expect(record.status).toBe('success');
    expect(record.inputTokens).toBe(321);
    expect(record.outputTokens).toBe(88);
    // 321/1e6 * 1 + 88/1e6 * 5 = 0.000761 with the fake per-Mtok pricing.
    expect(record.costUsd).toBeCloseTo(0.000761, 9);
  });

  it('reports a status:error record when the API throws, and still propagates', async () => {
    const { extractWithClaudeVision } = await import('../anthropic-client.js');
    const client: ScreenshotAnthropicLike = {
      messages: { create: () => Promise.reject(new Error('vision boom')) },
    };
    __setAnthropicClientForTests(client);

    await expect(
      extractWithClaudeVision({
        mimeType: 'image/png',
        base64: 'ZmFrZQ==',
        prompt: 'extract',
        model: 'claude-haiku-4-5-20251001',
      })
    ).rejects.toBeDefined();

    const record = await nextRecord();
    expect(record.status).toBe('error');
    expect(record.operation).toBe('recipe-extract-screenshot');
    expect(record.domain).toBe(FOOD_DOMAIN);
    expect(record.inputTokens).toBe(0);
    expect(record.outputTokens).toBe(0);
    expect(record.errorMessage).toBeDefined();
  });
});

function igClientReturning(jsonText: string, usage = { input_tokens: 100, output_tokens: 50 }) {
  const message: IgMessage = { content: [{ type: 'text', text: jsonText }], usage };
  const client: IgAnthropicLike = { messages: { create: () => Promise.resolve(message) } };
  return client;
}

describe('instagram vision — telemetry', () => {
  it('reports a recipe-extract-ig-vision success record without leaking the caption', async () => {
    const { extractWithClaudeVision } = await import('../../handlers/instagram/vision.js');
    const client = igClientReturning(RECIPE_JSON, { input_tokens: 77, output_tokens: 12 });

    const result = await extractWithClaudeVision(
      { caption: 'SECRET-CAPTION-TEXT', transcript: null, keyframePaths: [] },
      { client }
    );

    expect(result.parsed.title).toBe('Test Recipe');

    const record = await nextRecord();
    expect(record.operation).toBe('recipe-extract-ig-vision');
    expect(record.domain).toBe(FOOD_DOMAIN);
    expect(record.provider).toBe(ANTHROPIC_PROVIDER);
    expect(record.status).toBe('success');
    expect(record.inputTokens).toBe(77);
    expect(record.outputTokens).toBe(12);
    expect(JSON.stringify(record)).not.toContain('SECRET-CAPTION-TEXT');
  });
});

describe('instagram text-fallback — telemetry', () => {
  it('reports a recipe-extract-ig-text-fallback success record without leaking the caption', async () => {
    const { extractWithTextFallback } = await import('../../handlers/instagram/text-fallback.js');
    const client = igClientReturning(RECIPE_JSON, { input_tokens: 44, output_tokens: 9 });

    const result = await extractWithTextFallback(
      { caption: 'ANOTHER-SECRET-CAPTION that is plenty long enough for the fallback path' },
      { client }
    );

    expect(result.parsed.title).toBe('Test Recipe');
    expect(result.operation).toBe('recipe-extract-ig-text-fallback');

    const record = await nextRecord();
    expect(record.operation).toBe('recipe-extract-ig-text-fallback');
    expect(record.domain).toBe(FOOD_DOMAIN);
    expect(record.provider).toBe(ANTHROPIC_PROVIDER);
    expect(record.status).toBe('success');
    expect(record.inputTokens).toBe(44);
    expect(record.outputTokens).toBe(9);
    expect(JSON.stringify(record)).not.toContain('ANOTHER-SECRET-CAPTION');
  });
});
