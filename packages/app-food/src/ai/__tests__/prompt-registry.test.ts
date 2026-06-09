/**
 * PRD-133 — drift catcher for the prompt registry.
 *
 * Asserts that every `PROMPT_VERSION_*` constant exported from
 * `packages/app-food/src/prompts/` is referenced by an entry in
 * `FOOD_PROMPTS`. If a new prompt template ships without a registry
 * entry, this test fails — the viewer would otherwise silently omit
 * it.
 */
import { describe, expect, it } from 'vitest';

import * as igVision from '../../prompts/ig-vision.js';
import * as screenshot from '../../prompts/screenshot.js';
import * as text from '../../prompts/text.js';
import * as webLlm from '../../prompts/web-llm.js';
import { FOOD_PROMPTS } from '../prompt-registry.js';

function collectVersionExports(mod: Record<string, unknown>): string[] {
  return Object.entries(mod)
    .filter(([k, v]) => k.startsWith('PROMPT_VERSION_') && typeof v === 'string')
    .map(([, v]) => v as string);
}

describe('PRD-133 — FOOD_PROMPTS registry', () => {
  it('includes every PROMPT_VERSION_* constant from packages/app-food/src/prompts/', () => {
    const allVersions = [
      ...collectVersionExports(webLlm),
      ...collectVersionExports(igVision),
      ...collectVersionExports(screenshot),
      ...collectVersionExports(text),
    ].toSorted();

    const registered = FOOD_PROMPTS.map((p) => p.version).toSorted();

    expect(registered).toEqual(allVersions);
  });

  it('uses unique ids per entry', () => {
    const ids = FOOD_PROMPTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses unique versions per entry', () => {
    const versions = FOOD_PROMPTS.map((p) => p.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('attributes every entry to a PRD-1xx string', () => {
    for (const entry of FOOD_PROMPTS) {
      expect(entry.prd).toMatch(/^PRD-1\d{2}$/);
    }
  });

  it('includes a non-empty template per entry', () => {
    for (const entry of FOOD_PROMPTS) {
      expect(entry.template.length).toBeGreaterThan(0);
    }
  });
});
