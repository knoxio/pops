/**
 * PRD-133 — drift catcher for the prompt registry.
 *
 * Discovers every module under `pillars/food/app/src/prompts/` at
 * runtime via `import.meta.glob` so adding a new prompt file forces
 * the author to register it in `FOOD_PROMPTS` — no editing this test.
 */
import { describe, expect, it } from 'vitest';

import { FOOD_PROMPTS } from '../prompt-registry.js';

const promptModules = import.meta.glob<Record<string, unknown>>('../../prompts/*.ts', {
  eager: true,
});

function collectVersionExports(): string[] {
  const versions: string[] = [];
  for (const mod of Object.values(promptModules)) {
    for (const [key, value] of Object.entries(mod)) {
      if (key.startsWith('PROMPT_VERSION_') && typeof value === 'string') {
        versions.push(value);
      }
    }
  }
  return versions;
}

describe('PRD-133 — FOOD_PROMPTS registry', () => {
  it('discovers at least one prompt module under src/prompts/', () => {
    expect(Object.keys(promptModules).length).toBeGreaterThan(0);
  });

  it('includes every PROMPT_VERSION_* constant exported from src/prompts/', () => {
    const allVersions = collectVersionExports().toSorted();
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
