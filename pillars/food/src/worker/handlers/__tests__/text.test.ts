import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __setFoodTelemetryDepsForTests } from '../../ai/ai-telemetry-deps.js';
import { extractedRecipeSchema, type ExtractedRecipe } from '../extracted-recipe.js';
import { __setTextIngestClientForTests, extractWithClaudeText, runTextIngest } from '../text.js';

import type { InferenceRecord, PricingEntry } from '@pops/ai-telemetry';

import type { AnthropicLike, AnthropicMessage } from '../../ai/anthropic.js';
import type { HandlerContext } from '../types.js';

const ctx: HandlerContext = { isCancelled: () => false };

function mockMessage(
  text: string,
  usage = { input_tokens: 100, output_tokens: 150 }
): AnthropicMessage {
  return {
    content: [{ type: 'text', text }],
    usage: {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
    },
  };
}

function happyRecipeJson(overrides: Partial<ExtractedRecipe> = {}): ExtractedRecipe {
  const base: ExtractedRecipe = extractedRecipeSchema.parse({
    title: 'Smash Burger',
    summary: 'Crispy edges, melty cheese.',
    servings: 2,
    prep_time_minutes: 10,
    cook_time_minutes: 8,
    yield_slug: 'smash-burger',
    yield_qty: 2,
    yield_unit: 'serving',
    tags: ['american', 'beef'],
    ingredients: [
      {
        qty: 250,
        unit: 'g',
        ingredient_slug: 'beef-chuck',
        variant_slug: 'ground',
        prep_state_slug: 'whole',
        original_text: '250g ground beef',
        optional: false,
      },
      {
        qty: 2,
        unit: 'count',
        ingredient_slug: 'brioche-bun',
      },
      {
        qty: 1,
        unit: 'count',
        ingredient_slug: 'yellow-onion',
        prep_state_slug: 'sliced',
        original_text: '1 onion, sliced',
      },
    ],
    steps: [
      { body: 'Form @beef-chuck into two loose balls.', duration_minutes: 2 },
      { body: 'Smash onto a screaming-hot pan; cook 90 seconds.', duration_minutes: 3 },
    ],
  });
  return { ...base, ...overrides };
}

function buildMockClient(impl: () => Promise<AnthropicMessage>): AnthropicLike {
  return {
    messages: {
      create: vi.fn(impl),
    },
  };
}

const PRICING: PricingEntry = { input: 1, output: 5 };

let capturedRecords: InferenceRecord[];
let resolveNextRecord: ((record: InferenceRecord) => void) | undefined;

/** Resolves once the fire-and-forget telemetry report lands. */
function nextRecord(): Promise<InferenceRecord> {
  return new Promise<InferenceRecord>((resolve) => {
    if (capturedRecords.length > 0) {
      resolve(capturedRecords[capturedRecords.length - 1]!);
      return;
    }
    resolveNextRecord = resolve;
  });
}

beforeEach(() => {
  process.env['ANTHROPIC_API_KEY'] = 'test-key';
  process.env['FOOD_TEXT_LLM_MODEL'] = 'claude-haiku-4-5-20251001';
  capturedRecords = [];
  resolveNextRecord = undefined;
  __setFoodTelemetryDepsForTests({
    lookupPricing: () => Promise.resolve(PRICING),
    report: (record) => {
      capturedRecords.push(record);
      resolveNextRecord?.(record);
      return Promise.resolve();
    },
  });
});

afterEach(() => {
  __setTextIngestClientForTests(null);
  __setFoodTelemetryDepsForTests(null);
  delete process.env['ANTHROPIC_API_KEY'];
  delete process.env['FOOD_TEXT_LLM_MODEL'];
  vi.restoreAllMocks();
});

describe('runTextIngest — validation', () => {
  it('rejects bodies under 10 chars with EmptyText', async () => {
    const result = await runTextIngest({ kind: 'text', sourceId: 1, body: 'hi' }, ctx);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('EmptyText');
    const stage = result.meta.stages['input_validate'] as Record<string, unknown>;
    expect(stage).toMatchObject({ ok: false, reason: 'below-min' });
  });

  it('rejects whitespace-only bodies as EmptyText', async () => {
    const result = await runTextIngest({ kind: 'text', sourceId: 1, body: '          ' }, ctx);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('EmptyText');
  });

  it('short-circuits when cancelled before the LLM call', async () => {
    const create = vi.fn(async () => mockMessage('{}'));
    __setTextIngestClientForTests({ messages: { create } });
    const cancelCtx: HandlerContext = { isCancelled: () => true };
    const result = await runTextIngest(
      { kind: 'text', sourceId: 1, body: 'A perfectly fine recipe body.' },
      cancelCtx
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('Cancelled');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('runTextIngest — happy path', () => {
  it('returns ok with DSL when LLM produces a complete recipe', async () => {
    const recipe = happyRecipeJson();
    __setTextIngestClientForTests(buildMockClient(async () => mockMessage(JSON.stringify(recipe))));

    const result = await runTextIngest(
      { kind: 'text', sourceId: 42, body: 'Smash burger with brioche buns and onions.' },
      ctx
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.dsl).toContain('@recipe(');
    expect(result.dsl).toContain('@yield(');
    expect(result.dsl).toContain('@ingredient(1, beef-chuck:ground:whole, 250:g');
    expect(result.dsl).toContain('@step(');
    expect(result.partialReason).toBeUndefined();
    expect(result.meta.stages['llm_extract']).toMatchObject({
      ok: true,
      model: 'claude-haiku-4-5-20251001',
      prompt_version: 'text-v1.0',
      input_tokens: 100,
      output_tokens: 150,
    });
    const record = await nextRecord();
    expect(capturedRecords.length).toBe(1);
    expect(record.operation).toBe('recipe-extract-text');
    expect(record.domain).toBe('food');
    expect(record.provider).toBe('anthropic');
    expect(record.status).toBe('success');
    expect(record.contextId).toBe('ingest_source:42');
    expect(record.inputTokens).toBe(100);
    expect(record.outputTokens).toBe(150);
  });

  it('produces DSL whose lines satisfy the PRD-114 grammar shape', async () => {
    __setTextIngestClientForTests(
      buildMockClient(async () => mockMessage(JSON.stringify(happyRecipeJson())))
    );
    const result = await runTextIngest(
      { kind: 'text', sourceId: 7, body: 'A perfectly fine recipe body.' },
      ctx
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    const lines = result.dsl.split('\n');
    const recipeLine = lines.find((l) => l.startsWith('@recipe('));
    const yieldLine = lines.find((l) => l.startsWith('@yield('));
    expect(recipeLine).toMatch(/^@recipe\(slug=[a-z][a-z0-9-]*, title="[^"]+".*\)$/);
    expect(yieldLine).toMatch(/^@yield\([a-z][a-z0-9-]*, \d+(?:\.\d+)?:[a-z][a-z0-9-]*\)$/);
    const ingredientLines = lines.filter((l) => l.startsWith('@ingredient('));
    expect(ingredientLines.length).toBe(3);
    ingredientLines.forEach((line, idx) => {
      expect(line).toMatch(new RegExp(`^@ingredient\\(${idx + 1}, [a-z][a-z0-9_:-]*, `));
    });
    const stepLines = lines.filter((l) => l.startsWith('@step('));
    expect(stepLines.length).toBe(2);
    stepLines.forEach((line) => {
      expect(line).toMatch(/^@step\("[^"]+"(?:, duration=\d+(?:\.\d+)?:min)?\)$/);
    });
  });

  it('flags partial when LLM returns 0 ingredients', async () => {
    const recipe = happyRecipeJson({ ingredients: [] });
    __setTextIngestClientForTests(buildMockClient(async () => mockMessage(JSON.stringify(recipe))));
    const result = await runTextIngest(
      { kind: 'text', sourceId: 1, body: 'A short note about food.' },
      ctx
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.partialReason).toBe('empty-extraction');
  });

  it('flags partial when LLM returns 0 steps', async () => {
    const recipe = happyRecipeJson({ steps: [] });
    __setTextIngestClientForTests(buildMockClient(async () => mockMessage(JSON.stringify(recipe))));
    const result = await runTextIngest(
      { kind: 'text', sourceId: 1, body: 'A short note about food.' },
      ctx
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.partialReason).toBe('empty-extraction');
  });
});

describe('runTextIngest — rough idea elaboration', () => {
  it('accepts a rough idea body and emits DSL from the LLM elaboration', async () => {
    const elaborated = happyRecipeJson({ summary: 'Generated from rough idea.' });
    __setTextIngestClientForTests(
      buildMockClient(async () => mockMessage(JSON.stringify(elaborated)))
    );
    const result = await runTextIngest(
      { kind: 'text', sourceId: 1, body: 'smash burger with caramelised onions' },
      ctx
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.dsl).toContain('Generated from rough idea');
  });
});

describe('runTextIngest — error paths', () => {
  it('records truncation when body exceeds 20K chars', async () => {
    const oversized = 'x'.repeat(25_000);
    let receivedPrompt = '';
    __setTextIngestClientForTests({
      messages: {
        create: vi.fn(async (params) => {
          const msg = params.messages[0];
          receivedPrompt = typeof msg?.content === 'string' ? msg.content : '';
          return mockMessage(JSON.stringify(happyRecipeJson()));
        }),
      },
    });
    const result = await runTextIngest({ kind: 'text', sourceId: 1, body: oversized }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    const stage = result.meta.stages['input_validate'] as Record<string, unknown>;
    expect(stage).toMatchObject({ ok: true, truncated: true });
    expect(stage['length']).toBe(20_000);
    expect(receivedPrompt.length).toBeLessThan(oversized.length + 5_000);
  });

  it('fails with LlmExtractFailed when the response is not JSON', async () => {
    __setTextIngestClientForTests(buildMockClient(async () => mockMessage('not json at all')));
    const result = await runTextIngest(
      { kind: 'text', sourceId: 1, body: 'asdjkfhlasjdkfh garbage gibberish' },
      ctx
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('LlmExtractFailed');
    expect(result.errorMessage).toMatch(/non-JSON/);
  });

  it('fails with LlmExtractFailed when the LLM returns empty strings for required numerics', async () => {
    // Regression: `numericLike` must reject `""` rather than coercing it
    // to 0 (Number("") === 0). Silently zeroing missing numeric fields
    // would let an unusable extraction pass validation.
    __setTextIngestClientForTests(
      buildMockClient(async () =>
        mockMessage(
          JSON.stringify({
            title: 'Plain Salad',
            servings: '',
            ingredients: [],
            steps: [],
          })
        )
      )
    );
    const result = await runTextIngest(
      { kind: 'text', sourceId: 1, body: 'A perfectly fine recipe body.' },
      ctx
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('LlmExtractFailed');
    expect(result.errorMessage).toMatch(/servings/);
  });

  it('records duration_ms on the LLM-failure stage when the call throws', async () => {
    // Regression: the failure path used to hardcode durationMs: 0 which
    // hid slow timeouts behind a zero-latency log line.
    __setTextIngestClientForTests({
      messages: {
        create: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          throw new Error('network blew up');
        }),
      },
    });
    const result = await runTextIngest(
      { kind: 'text', sourceId: 1, body: 'A perfectly fine recipe body.' },
      ctx
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('LlmExtractFailed');
    const stage = result.meta.stages['llm_extract'] as Record<string, unknown>;
    expect(typeof stage['duration_ms']).toBe('number');
    expect(stage['duration_ms']).toBeGreaterThan(0);
  });

  it('fails with LlmExtractFailed on schema violation (missing title)', async () => {
    __setTextIngestClientForTests(
      buildMockClient(async () =>
        mockMessage(JSON.stringify({ ingredients: [], steps: [], servings: 2 }))
      )
    );
    const result = await runTextIngest(
      { kind: 'text', sourceId: 1, body: 'gibberish that maps to nothing' },
      ctx
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('LlmExtractFailed');
    expect(result.errorMessage).toMatch(/title/);
  });

  it('captures multi-recipe input by extracting only the first recipe', async () => {
    const recipe = happyRecipeJson();
    __setTextIngestClientForTests(buildMockClient(async () => mockMessage(JSON.stringify(recipe))));
    const multi = 'Recipe 1: smash burger ...\n\nRecipe 2: caesar salad ...';
    const result = await runTextIngest({ kind: 'text', sourceId: 1, body: multi }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.dsl).toContain('smash-burger');
    expect(result.dsl).not.toContain('caesar-salad');
  });

  it('fails when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env['ANTHROPIC_API_KEY'];
    const result = await runTextIngest(
      { kind: 'text', sourceId: 1, body: 'A perfectly fine recipe body.' },
      ctx
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('LlmExtractFailed');
    expect(result.errorMessage).toMatch(/ANTHROPIC_API_KEY/);
  });
});

describe('extractWithClaudeText — shared surface', () => {
  it('writes operation=recipe-extract-ig-text-fallback when called with that source', async () => {
    __setTextIngestClientForTests(
      buildMockClient(async () => mockMessage(JSON.stringify(happyRecipeJson())))
    );
    const result = await extractWithClaudeText({
      body: 'transcribed caption',
      source: 'ig-text-fallback',
      contextId: 'ingest_source:99',
    });
    expect(result.ok).toBe(true);
    const record = await nextRecord();
    expect(record.operation).toBe('recipe-extract-ig-text-fallback');
    expect(record.domain).toBe('food');
  });
});
