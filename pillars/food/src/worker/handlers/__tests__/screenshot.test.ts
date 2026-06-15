import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __setAnthropicClientForTests } from '../../ai/anthropic-client.js';
import { PROMPT_VERSION_SCREENSHOT, SCREENSHOT_DEFAULT_MODEL } from '../../prompts/screenshot.js';
import { runScreenshotIngest } from '../screenshot.js';

import type { IngestJobData } from '../../../contract/queue/index.js';
import type { HandlerContext } from '../types.js';

const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/screenshots/', import.meta.url));

const neverCancelled: HandlerContext = { isCancelled: () => false };
const alwaysCancelled: HandlerContext = { isCancelled: () => true };

const fullRecipeJson = {
  title: 'Smash Burger',
  summary: 'Crispy, lacy-edged smash burgers on potato buns.',
  servings: 2,
  prep_time_minutes: 10,
  cook_time_minutes: 8,
  yield_slug: 'smash-burger',
  yield_qty: 2,
  yield_unit: 'count',
  tags: ['burger', 'beef', 'lunch'],
  ingredients: [
    {
      qty: 200,
      unit: 'g',
      ingredient_slug: 'beef-chuck',
      variant_slug: 'ground',
      original_text: '200g ground chuck',
      optional: false,
    },
    {
      qty: 2,
      unit: 'count',
      ingredient_slug: 'potato-bun',
      original_text: '2 potato buns',
      notes: 'lightly toasted',
    },
  ],
  steps: [
    { body: 'Roll @beef-chuck into two 100g balls.', duration_minutes: 1 },
    { body: 'Smash onto a screaming-hot pan for 90 seconds.', duration_minutes: 2 },
  ],
};

const emptyRecipeJson = {
  ...fullRecipeJson,
  ingredients: [],
  steps: [],
};

type MockUsage = { input_tokens: number; output_tokens: number };
type MockResponse = {
  model?: string;
  content: Array<{ type: 'text'; text: string }>;
  usage: MockUsage;
};

function makeMockClient(response: MockResponse | (() => Promise<MockResponse>)) {
  const create = vi.fn(async () => (typeof response === 'function' ? await response() : response));
  return { messages: { create } } as Parameters<typeof __setAnthropicClientForTests>[0] & {
    messages: { create: typeof create };
  };
}

function jobData(
  overrides: Partial<Extract<IngestJobData, { kind: 'screenshot' }>> = {}
): Extract<IngestJobData, { kind: 'screenshot' }> {
  return {
    kind: 'screenshot',
    sourceId: 42,
    mimeType: 'image/png',
    contentPath: join(FIXTURES_DIR, 'tiny.png'),
    ...overrides,
  };
}

function assistantText(payload: unknown): MockResponse {
  return {
    model: SCREENSHOT_DEFAULT_MODEL,
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    usage: { input_tokens: 1280, output_tokens: 420 },
  };
}

beforeEach(() => {
  __setAnthropicClientForTests(null);
  delete process.env['FOOD_SCREENSHOT_VISION_MODEL'];
});

afterEach(() => {
  __setAnthropicClientForTests(null);
  vi.restoreAllMocks();
});

describe('runScreenshotIngest', () => {
  it('produces a DSL string and meta JSON on the happy path', async () => {
    const client = makeMockClient(assistantText(fullRecipeJson));
    __setAnthropicClientForTests(client);

    const result = await runScreenshotIngest(jobData(), neverCancelled);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.partialReason).toBeUndefined();
    expect(result.dsl).toContain('@recipe(slug="smash-burger"');
    expect(result.dsl).toContain('servings=2');
    expect(result.dsl).toContain('@yield(smash-burger, 2:count)');
    expect(result.dsl).toContain('@ingredient(1, beef-chuck:ground, 200:g)');
    expect(result.dsl).toContain('@ingredient(2, potato-bun, 2:count, notes="lightly toasted")');
    expect(result.dsl).toContain('@step("Roll @beef-chuck into two 100g balls."');
    expect(result.dsl).toContain('duration=1:min');
    expect(result.meta.extractor_version).toMatch(/^pops-worker-food\/screenshot@/);
    const stages = result.meta.stages as Record<string, Record<string, unknown>>;
    expect(stages['file_read']).toMatchObject({ ok: true, bytes: expect.any(Number) });
    expect(stages['vision']).toMatchObject({
      ok: true,
      model: SCREENSHOT_DEFAULT_MODEL,
      prompt_version: PROMPT_VERSION_SCREENSHOT,
      input_tokens: 1280,
      output_tokens: 420,
    });
    expect(stages['dsl_build']).toMatchObject({ ok: true });
    expect(result.meta.total_cost_usd).toBeGreaterThan(0);
    expect(client.messages.create).toHaveBeenCalledTimes(1);
    const callArg = client.messages.create.mock.calls[0]?.[0] as {
      model: string;
      messages: Array<{
        content: Array<
          | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
          | { type: 'text'; text: string }
        >;
      }>;
    };
    expect(callArg.model).toBe(SCREENSHOT_DEFAULT_MODEL);
    const imageBlock = callArg.messages[0]?.content.find((b) => b.type === 'image');
    expect(imageBlock).toBeTruthy();
    if (!imageBlock || imageBlock.type !== 'image') throw new Error('unreachable');
    expect(imageBlock.source.media_type).toBe('image/png');
    expect(imageBlock.source.data.length).toBeGreaterThan(0);
  });

  it('respects FOOD_SCREENSHOT_VISION_MODEL override', async () => {
    process.env['FOOD_SCREENSHOT_VISION_MODEL'] = 'claude-haiku-4-5';
    const client = makeMockClient({
      ...assistantText(fullRecipeJson),
      model: 'claude-haiku-4-5',
    });
    __setAnthropicClientForTests(client);

    const result = await runScreenshotIngest(jobData(), neverCancelled);
    expect(result.ok).toBe(true);
    const callArg = client.messages.create.mock.calls[0]?.[0] as { model: string };
    expect(callArg.model).toBe('claude-haiku-4-5');
  });

  it('marks the result partial when ingredients/steps are empty', async () => {
    __setAnthropicClientForTests(makeMockClient(assistantText(emptyRecipeJson)));

    const result = await runScreenshotIngest(jobData(), neverCancelled);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.partialReason).toBe('empty-extraction');
  });

  it('returns VisionExtractFailed when the LLM emits malformed JSON', async () => {
    __setAnthropicClientForTests(
      makeMockClient({
        model: SCREENSHOT_DEFAULT_MODEL,
        content: [{ type: 'text', text: 'sure, here you go!\n{not-json' }],
        usage: { input_tokens: 100, output_tokens: 20 },
      })
    );

    const result = await runScreenshotIngest(jobData(), neverCancelled);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('VisionExtractFailed');
    expect(result.errorMessage).toMatch(/not valid JSON/i);
  });

  it('returns VisionExtractFailed when the JSON fails schema validation', async () => {
    __setAnthropicClientForTests(
      makeMockClient(assistantText({ ...fullRecipeJson, servings: 'two' }))
    );

    const result = await runScreenshotIngest(jobData(), neverCancelled);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('VisionExtractFailed');
    expect(result.errorMessage).toMatch(/schema validation/i);
  });

  it('returns VisionExtractFailed when the SDK throws', async () => {
    __setAnthropicClientForTests(
      makeMockClient(async () => {
        throw new Error('429 rate limited');
      })
    );

    const result = await runScreenshotIngest(jobData(), neverCancelled);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('VisionExtractFailed');
    expect(result.errorMessage).toMatch(/429 rate limited/);
  });

  it('returns FileReadFailed when the image is missing on disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'prd131-'));
    try {
      const missing = join(dir, 'does-not-exist.png');
      const result = await runScreenshotIngest(jobData({ contentPath: missing }), neverCancelled);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.errorCode).toBe('FileReadFailed');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('short-circuits with Cancelled before the file read', async () => {
    const create = vi.fn();
    __setAnthropicClientForTests({ messages: { create } });

    const result = await runScreenshotIngest(jobData(), alwaysCancelled);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('Cancelled');
    expect(create).not.toHaveBeenCalled();
  });

  it('honours cancellation between vision call and DSL build', async () => {
    let calls = 0;
    const ctx: HandlerContext = {
      isCancelled: () => {
        // Pre-file-read check returns false; post-vision check returns true.
        const cancelled = calls > 0;
        calls += 1;
        return cancelled;
      },
    };
    __setAnthropicClientForTests(makeMockClient(assistantText(fullRecipeJson)));

    const result = await runScreenshotIngest(jobData(), ctx);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('Cancelled');
  });

  it('accepts a JPEG payload and forwards the mime type to the SDK', async () => {
    const client = makeMockClient(assistantText(fullRecipeJson));
    __setAnthropicClientForTests(client);

    await runScreenshotIngest(
      jobData({ mimeType: 'image/jpeg', contentPath: join(FIXTURES_DIR, 'tiny.jpg') }),
      neverCancelled
    );

    const callArg = client.messages.create.mock.calls[0]?.[0] as {
      messages: Array<{ content: Array<{ type: string; source?: { media_type: string } }> }>;
    };
    const image = callArg.messages[0]?.content.find((b) => b.type === 'image') as
      | { source: { media_type: string } }
      | undefined;
    expect(image?.source.media_type).toBe('image/jpeg');
  });

  it('accepts a WebP payload', async () => {
    const client = makeMockClient(assistantText(fullRecipeJson));
    __setAnthropicClientForTests(client);

    const result = await runScreenshotIngest(
      jobData({ mimeType: 'image/webp', contentPath: join(FIXTURES_DIR, 'tiny.webp') }),
      neverCancelled
    );

    expect(result.ok).toBe(true);
  });

  it('rejects unsupported mime types as VisionExtractFailed without calling the SDK', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'prd131-'));
    const path = join(tmp, 'recipe.gif');
    try {
      await writeFile(path, Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]));
      const create = vi.fn();
      __setAnthropicClientForTests({ messages: { create } });

      const result = await runScreenshotIngest(
        jobData({ mimeType: 'image/gif', contentPath: path }),
        neverCancelled
      );

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.errorCode).toBe('VisionExtractFailed');
      expect(create).not.toHaveBeenCalled();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
