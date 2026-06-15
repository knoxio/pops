import { describe, expect, it, vi } from 'vitest';

import { setAnthropicClientForTests } from '../../ai/web-llm-anthropic.js';
import { buildWebLlmDsl, slugify } from '../web-llm-dsl.js';
import { extractReadable } from '../web-llm-readability.js';
import { processWithLlm } from '../web-llm.js';

import type { IngestJobData } from '../../../contract/queue/index.js';
import type { AnthropicLike, AnthropicMessage } from '../../ai/web-llm-anthropic.js';
import type { ExtractedRecipe } from '../web-llm-recipe.js';

const WEB_JOB = {
  kind: 'url-web',
  sourceId: 9001,
  url: 'https://blog.example.com/pasta',
} as const satisfies IngestJobData;

const SAMPLE_RECIPE: ExtractedRecipe = {
  title: 'Weeknight Tomato Pasta',
  summary: 'Quick weeknight pasta with canned tomatoes and basil.',
  servings: 4,
  prep_time_minutes: 10,
  cook_time_minutes: 25,
  yield_slug: 'tomato-pasta-plate',
  yield_qty: 4,
  yield_unit: 'count',
  tags: ['italian', 'weeknight'],
  ingredients: [
    { qty: 400, unit: 'g', ingredient_slug: 'pasta', variant_slug: 'spaghetti', optional: false },
    {
      qty: 800,
      unit: 'g',
      ingredient_slug: 'tomato',
      variant_slug: 'canned-whole',
      prep_state_slug: 'crushed',
      optional: false,
    },
    {
      qty: 30,
      unit: 'ml',
      ingredient_slug: 'olive-oil',
      prep_state_slug: 'spiralised',
      optional: false,
    },
    { qty: 4, unit: 'count', ingredient_slug: 'garlic', notes: 'fresh if possible' },
  ],
  steps: [
    { body: 'Boil @1 in salted water until al dente.', duration_minutes: 10 },
    { body: 'Crush @4 and bloom in @3 over low heat.' },
    { body: 'Add @2 and simmer.' },
  ],
};

function fakeClient(
  content: string,
  usage = { input_tokens: 1200, output_tokens: 400 }
): AnthropicLike {
  const message: AnthropicMessage = {
    model: 'claude-haiku-4-5-20251001',
    content: [{ type: 'text', text: content }],
    usage,
  };
  return {
    messages: {
      create: vi.fn(async () => message) as AnthropicLike['messages']['create'],
    },
  };
}

const SMALL_HTML = `<!doctype html><html><body><nav>menu</nav><main><h1>${SAMPLE_RECIPE.title}</h1>${'<p>This is a recipe blog post about tomato pasta. '.repeat(20)}</p></main></body></html>`;

describe('slugify', () => {
  it.each([
    ['Weeknight Tomato Pasta', 'weeknight-tomato-pasta'],
    ['  spaced   out  ', 'spaced-out'],
    ['Café Naïve', 'cafe-naive'],
    ['Spicy 🌶️ Pasta', 'spicy-pasta'],
    ['___under_score___', 'under-score'],
    ['', ''],
  ])('slugifies %p → %p', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe('extractReadable', () => {
  it('returns null when content is below the 200-char minimum', () => {
    const html = '<!doctype html><html><body><main><p>tiny</p></main></body></html>';
    expect(extractReadable(html, 'https://example.com/')).toBeNull();
  });

  it('truncates content above 15K chars and flags truncated=true', () => {
    const long = '<p>recipe text. </p>'.repeat(2000);
    const html = `<!doctype html><html><body><main><h1>Long Recipe</h1>${long}</main></body></html>`;
    const article = extractReadable(html, 'https://example.com/');
    expect(article).not.toBeNull();
    if (article == null) return;
    expect(article.truncated).toBe(true);
    expect(article.textContent.length).toBeLessThanOrEqual(15_000);
  });

  it('returns title and textContent on a typical recipe blog post', () => {
    const article = extractReadable(SMALL_HTML, WEB_JOB.url);
    expect(article).not.toBeNull();
    if (article == null) return;
    expect(article.textLength).toBeGreaterThan(200);
    expect(article.textContent).toContain('tomato pasta');
  });
});

describe('buildWebLlmDsl', () => {
  it('renders the @recipe header with title-derived slug + servings + times', () => {
    const result = buildWebLlmDsl(SAMPLE_RECIPE, { source: 'url-web', url: WEB_JOB.url });
    expect(result.slug).toBe('weeknight-tomato-pasta');
    expect(result.dsl).toMatch(/@recipe\(/);
    expect(result.dsl).toContain('slug="weeknight-tomato-pasta"');
    expect(result.dsl).toContain('title="Weeknight Tomato Pasta"');
    expect(result.dsl).toContain('servings=4');
    expect(result.dsl).toContain('prep_time=10:min');
    expect(result.dsl).toContain('cook_time=25:min');
  });

  it('emits @yield + numbered @ingredient lines', () => {
    const result = buildWebLlmDsl(SAMPLE_RECIPE, { source: 'url-web', url: WEB_JOB.url });
    expect(result.dsl).toMatch(/@yield\(tomato-pasta-plate, 4:count\)/);
    expect(result.dsl).toMatch(/@ingredient\(1, pasta, variant="spaghetti", qty=400, unit="g"\)/);
    expect(result.dsl).toMatch(
      /@ingredient\(2, tomato, variant="canned-whole", prep="crushed", qty=800, unit="g"\)/
    );
  });

  it('redirects invalid prep_state_slug values to the notes field and counts them', () => {
    const result = buildWebLlmDsl(SAMPLE_RECIPE, { source: 'url-web', url: WEB_JOB.url });
    expect(result.prepFallbackCount).toBe(1);
    expect(result.dsl).toMatch(
      /@ingredient\(3, olive-oil, qty=30, unit="ml", notes="prep: spiralised"\)/
    );
  });

  it('preserves explicit notes alongside prep-fallback notes', () => {
    const recipe: ExtractedRecipe = {
      ...SAMPLE_RECIPE,
      ingredients: [
        {
          qty: 1,
          unit: 'count',
          ingredient_slug: 'onion',
          prep_state_slug: 'spiralised',
          notes: 'red if possible',
          optional: false,
        },
      ],
    };
    const result = buildWebLlmDsl(recipe, { source: 'url-web', url: WEB_JOB.url });
    expect(result.dsl).toContain('notes="prep: spiralised; red if possible"');
  });

  it('passes @<slug> step refs through verbatim and keeps numeric refs intact', () => {
    const result = buildWebLlmDsl(SAMPLE_RECIPE, { source: 'url-web', url: WEB_JOB.url });
    expect(result.dsl).toMatch(/@step\("Boil @1 in salted water until al dente\."\)/);
    const slugStep: ExtractedRecipe = {
      ...SAMPLE_RECIPE,
      steps: [{ body: 'Toss @pasta into the @sauce.' }],
    };
    expect(buildWebLlmDsl(slugStep, { source: 'url-web', url: WEB_JOB.url }).dsl).toContain(
      '@step("Toss @pasta into the @sauce.")'
    );
  });

  it('escapes embedded double quotes and backslashes in step bodies', () => {
    const recipe: ExtractedRecipe = {
      ...SAMPLE_RECIPE,
      steps: [{ body: 'Press "smash" patties with a 1\\2 spatula.' }],
    };
    const result = buildWebLlmDsl(recipe, { source: 'url-web', url: WEB_JOB.url });
    expect(result.dsl).toContain('"Press \\"smash\\" patties with a 1\\\\2 spatula."');
  });

  it('falls back to "untitled-recipe" when the title slugifies to empty', () => {
    const recipe: ExtractedRecipe = { ...SAMPLE_RECIPE, title: '🍝🍝🍝' };
    expect(buildWebLlmDsl(recipe, { source: 'url-web', url: WEB_JOB.url }).slug).toBe(
      'untitled-recipe'
    );
  });
});

describe('processWithLlm', () => {
  it('returns ok=true with DSL + meta on the happy path', async () => {
    const onLog = vi.fn();
    const client = fakeClient(JSON.stringify(SAMPLE_RECIPE));

    const result = await processWithLlm(SMALL_HTML, WEB_JOB, WEB_JOB.url, {
      client,
      onLog,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dsl).toContain('@recipe(');
    expect(result.dsl).toContain('@ingredient(1, pasta');
    expect(result.partialReason).toBeUndefined();

    expect(result.meta.stages['readability']).toMatchObject({ ok: true });
    expect(result.meta.stages['llm_extract']).toMatchObject({
      ok: true,
      model: 'claude-haiku-4-5-20251001',
      prompt_version: 'web-llm-v1.0',
    });
    expect(result.meta.stages['dsl_build']).toMatchObject({ ok: true });
    expect(result.meta.total_cost_usd).toBeGreaterThan(0);

    expect(onLog).toHaveBeenCalledTimes(1);
    const logged = onLog.mock.calls[0]?.[0];
    expect(logged).toMatchObject({
      operation: 'recipe-extract-web-llm',
      contextId: `ingest_source:${WEB_JOB.sourceId}`,
      ok: true,
    });
  });

  it('returns NoExtractableContent when readability bottoms out', async () => {
    const client = fakeClient(JSON.stringify(SAMPLE_RECIPE));
    const result = await processWithLlm(
      '<html><body><p>too short</p></body></html>',
      WEB_JOB,
      WEB_JOB.url,
      { client }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe('NoExtractableContent');
    expect(result.meta.stages['readability']).toMatchObject({ ok: false });
    expect(
      (client.messages.create as unknown as { mock: { calls: unknown[] } }).mock.calls
    ).toHaveLength(0);
  });

  it('rejects markdown-fenced LLM responses as malformed JSON', async () => {
    const fenced = `\`\`\`json\n${JSON.stringify(SAMPLE_RECIPE)}\n\`\`\``;
    const result = await processWithLlm(SMALL_HTML, WEB_JOB, WEB_JOB.url, {
      client: fakeClient(fenced),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe('LlmExtractFailed');
    expect(result.errorMessage).toMatch(/malformed-json/);
    expect(result.meta.llm_raw_output).toBe(fenced);
  });

  it('rejects zod-shaped violations and surfaces the raw response in meta', async () => {
    const broken = JSON.stringify({ ...SAMPLE_RECIPE, ingredients: [{ qty: 1 }] });
    const result = await processWithLlm(SMALL_HTML, WEB_JOB, WEB_JOB.url, {
      client: fakeClient(broken),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorMessage).toMatch(/schema-violation/);
    expect(result.meta.llm_raw_output).toBe(broken);
  });

  it('flags 0-ingredient outputs as partial=empty-extraction', async () => {
    const emptyIng: ExtractedRecipe = { ...SAMPLE_RECIPE, ingredients: [] };
    const result = await processWithLlm(SMALL_HTML, WEB_JOB, WEB_JOB.url, {
      client: fakeClient(JSON.stringify(emptyIng)),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.partialReason).toBe('empty-extraction');
  });

  it('flags 0-step outputs as partial=empty-extraction', async () => {
    const emptySteps: ExtractedRecipe = { ...SAMPLE_RECIPE, steps: [] };
    const result = await processWithLlm(SMALL_HTML, WEB_JOB, WEB_JOB.url, {
      client: fakeClient(JSON.stringify(emptySteps)),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.partialReason).toBe('empty-extraction');
  });

  it('classifies SDK rejections as sdk-error LlmExtractFailed', async () => {
    const client: AnthropicLike = {
      messages: {
        create: vi.fn(async () => {
          throw new Error('network unreachable');
        }) as AnthropicLike['messages']['create'],
      },
    };
    const onLog = vi.fn();
    const result = await processWithLlm(SMALL_HTML, WEB_JOB, WEB_JOB.url, {
      client,
      onLog,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorMessage).toMatch(/sdk-error/);
    expect(onLog).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  it('returns Cancelled before invoking readability or the LLM when cancelled up-front', async () => {
    const createSpy = vi.fn();
    const result = await processWithLlm(SMALL_HTML, WEB_JOB, WEB_JOB.url, {
      ctx: { isCancelled: () => true },
      client: { messages: { create: createSpy as AnthropicLike['messages']['create'] } },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe('Cancelled');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('returns Cancelled after readability when cancellation flips mid-pipeline', async () => {
    let calls = 0;
    const createSpy = vi.fn();
    const result = await processWithLlm(SMALL_HTML, WEB_JOB, WEB_JOB.url, {
      ctx: {
        isCancelled: () => {
          calls += 1;
          return calls > 1; // false on the pre-readability check, true after.
        },
      },
      client: { messages: { create: createSpy as AnthropicLike['messages']['create'] } },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe('Cancelled');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('respects the FOOD_WEB_LLM_MODEL env override', async () => {
    const prev = process.env['FOOD_WEB_LLM_MODEL'];
    process.env['FOOD_WEB_LLM_MODEL'] = 'claude-test-model';
    const created: { model?: string } = {};
    const client: AnthropicLike = {
      messages: {
        create: vi.fn(async (params) => {
          created.model = params.model;
          return {
            model: params.model,
            content: [{ type: 'text', text: JSON.stringify(SAMPLE_RECIPE) }],
            usage: { input_tokens: 100, output_tokens: 100 },
          };
        }) as AnthropicLike['messages']['create'],
      },
    };
    try {
      const result = await processWithLlm(SMALL_HTML, WEB_JOB, WEB_JOB.url, { client });
      expect(result.ok).toBe(true);
      expect(created.model).toBe('claude-test-model');
    } finally {
      if (prev == null) delete process.env['FOOD_WEB_LLM_MODEL'];
      else process.env['FOOD_WEB_LLM_MODEL'] = prev;
    }
  });
});

describe('getAnthropicClient', () => {
  it('throws when ANTHROPIC_API_KEY is not set', async () => {
    const { getAnthropicClient } = await import('../../ai/web-llm-anthropic.js');
    setAnthropicClientForTests(null);
    const prev = process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
    try {
      expect(() => getAnthropicClient()).toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (prev != null) process.env['ANTHROPIC_API_KEY'] = prev;
    }
  });
});
