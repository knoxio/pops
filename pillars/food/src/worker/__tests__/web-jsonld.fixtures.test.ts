/**
 * PRD-127 fixture suite.
 *
 * For each saved recipe page:
 *   1. Run the JSON-LD extractor — assert a Recipe node was found.
 *   2. Run the deterministic DSL mapper — assert the produced DSL parses
 *      cleanly via PRD-114's `parseRecipeDsl` (the same parser PRD-116's
 *      `compileRecipeVersion` consumes; a parse failure here would block
 *      compile against a real DB downstream).
 *   3. Smoke-check the produced DSL shape (@recipe header, @yield, ≥1
 *      @ingredient, ≥1 @step).
 *
 * A separate test exercises the no-Recipe fallback path (extractor returns
 * null → the handler emits `JsonLdMissing` which PRD-128 will replace with
 * its LLM fallback).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// PRD-114 parser. PRD-119-API extracted the DSL pipeline out of `@pops/app-food`
// into `@pops/app-food-db` so the backend (and this worker) can pull it in
// without React + CodeMirror getting dragged along.
import { parseRecipeDsl } from '../../dsl/index.js';
import { runWebUrlIngestWith } from '../handlers/web-url.js';
import { extractRecipeJsonLd } from '../handlers/web/extract-json-ld.js';
import { mapJsonLdToDsl } from '../handlers/web/map-to-dsl.js';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFilePath);
const FIXTURE_DIR = join(currentDir, 'fixtures', 'web');

interface FixtureCase {
  name: string;
  html: string;
  expectsRecipe: boolean;
}

function loadFixtures(): FixtureCase[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.html'))
    .toSorted()
    .map((name) => ({
      name,
      html: readFileSync(join(FIXTURE_DIR, name), 'utf8'),
      expectsRecipe: !name.includes('no-jsonld'),
    }));
}

describe('PRD-127 — JSON-LD fixture suite', () => {
  const fixtures = loadFixtures();

  it('loads ≥10 fixtures with Recipe JSON-LD', () => {
    const withRecipe = fixtures.filter((f) => f.expectsRecipe);
    expect(withRecipe.length).toBeGreaterThanOrEqual(10);
  });

  it('loads a no-JSON-LD fixture so the fallback signal stays tested', () => {
    expect(fixtures.some((f) => !f.expectsRecipe)).toBe(true);
  });

  for (const fixture of fixtures.filter((f) => f.expectsRecipe)) {
    it(`extracts + maps + parses ${fixture.name}`, () => {
      const jsonLd = extractRecipeJsonLd(fixture.html);
      expect(jsonLd, 'JSON-LD Recipe node detected').not.toBeNull();
      if (jsonLd === null) throw new Error('unreachable');

      const mapped = mapJsonLdToDsl(jsonLd);
      expect(mapped.slug.length).toBeGreaterThan(0);
      expect(mapped.dsl).toMatch(/^@recipe\(/m);
      expect(mapped.dsl).toMatch(/^@yield\(/m);
      expect(mapped.dsl).toMatch(/^@ingredient\(/m);
      expect(mapped.dsl).toMatch(/^@step\(/m);
      expect(mapped.stats.ingredients).toBeGreaterThan(0);
      expect(mapped.stats.steps).toBeGreaterThan(0);

      const parsed = parseRecipeDsl(mapped.dsl);
      if (!parsed.ok) {
        throw new Error(
          `parseRecipeDsl failed for ${fixture.name}:\n` +
            parsed.errors.map((e) => `  ${e.code}: ${e.message}`).join('\n') +
            `\n--- DSL ---\n${mapped.dsl}`
        );
      }
    });
  }
});

describe('PRD-127 — fallback signalling', () => {
  it('extractor returns null when no Recipe JSON-LD is present', () => {
    const html = readFileSync(join(FIXTURE_DIR, '11-no-jsonld.html'), 'utf8');
    expect(extractRecipeJsonLd(html)).toBeNull();
  });

  it('handler emits JsonLdMissing when extractor finds nothing', async () => {
    const html = readFileSync(join(FIXTURE_DIR, '11-no-jsonld.html'), 'utf8');
    const result = await runWebUrlIngestWith(
      { kind: 'url-web', sourceId: 999, url: 'https://example.test/no-recipe' },
      { isCancelled: () => false },
      {
        fetchHtmlImpl: async () => ({
          ok: true,
          html,
          finalUrl: 'https://example.test/no-recipe',
          status: 200,
          bytes: html.length,
          durationMs: 5,
        }),
      }
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('JsonLdMissing');
  });
});

describe('PRD-127 — observability', () => {
  it('no ai_inference_log row is implied — the handler never emits an LLM marker', async () => {
    const html = readFileSync(join(FIXTURE_DIR, '01-classic.html'), 'utf8');
    const result = await runWebUrlIngestWith(
      { kind: 'url-web', sourceId: 1, url: 'https://example.test/classic' },
      { isCancelled: () => false },
      {
        fetchHtmlImpl: async () => ({
          ok: true,
          html,
          finalUrl: 'https://example.test/classic',
          status: 200,
          bytes: html.length,
          durationMs: 5,
        }),
      }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.meta.total_cost_usd).toBeUndefined();
    expect(result.meta.llm_raw_output).toBeUndefined();
    // Every stage is deterministic — none of them write a `model` or
    // `tokens` field. If they ever do, this assertion catches the drift.
    for (const stage of Object.values(result.meta.stages)) {
      if (stage !== null && typeof stage === 'object') {
        expect(stage).not.toHaveProperty('model');
        expect(stage).not.toHaveProperty('input_tokens');
        expect(stage).not.toHaveProperty('output_tokens');
      }
    }
  });
});
