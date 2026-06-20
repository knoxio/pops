/**
 * PRD-130 — local build-dsl unit tests. Asserts the DSL output is
 * parseable by the PRD-114 parser and that the descriptor + tail rules
 * match the PRD.
 */
import { describe, expect, it } from 'vitest';

import { parseRecipeDsl } from '../../dsl/index.js';
import { buildDsl } from '../handlers/instagram/build-dsl.js';

import type { ExtractedRecipe } from '../handlers/instagram/extracted-recipe.js';

const HAPPY: ExtractedRecipe = {
  title: 'Smash Burger',
  summary: 'Crispy edges, melty cheese.',
  servings: 4,
  prep_time_min: 5,
  cook_time_min: 10,
  ingredients: [
    {
      ingredient_slug: 'beef-chuck',
      variant_slug: null,
      prep_state_slug: 'minced',
      qty: 500,
      unit: 'g',
      notes: null,
    },
    {
      ingredient_slug: 'salt',
      variant_slug: null,
      prep_state_slug: null,
      qty: 5,
      unit: 'g',
      notes: null,
    },
    {
      ingredient_slug: 'buns',
      variant_slug: 'brioche',
      prep_state_slug: null,
      qty: 4,
      unit: 'count',
      notes: 'toasted',
    },
  ],
  steps: [
    { body: 'Divide beef into 4 balls.', duration_min: null, temperature_c: null },
    { body: 'Sear on a hot pan.', duration_min: 2, temperature_c: 200 },
  ],
};

describe('buildDsl (Instagram)', () => {
  it('produces a parseable DSL string', () => {
    const { dsl } = buildDsl(HAPPY);
    const parsed = parseRecipeDsl(dsl);
    if (!parsed.ok) throw new Error(parsed.errors.map((e) => e.message).join('\n'));
  });

  it('disambiguates the recipe slug against the reserved set', () => {
    const reserved = new Set(['smash-burger']);
    const { slug } = buildDsl(HAPPY, { reservedSlugs: reserved });
    expect(slug).toBe('smash-burger-2');
  });

  it('drops a non-curated prep_state into ingredient notes path (skipped via sanitiser)', () => {
    const recipe: ExtractedRecipe = {
      ...HAPPY,
      ingredients: [
        {
          ingredient_slug: 'tomato',
          variant_slug: null,
          prep_state_slug: 'frenched',
          qty: 1,
          unit: 'count',
          notes: null,
        },
      ],
      steps: [{ body: 'Add tomato.', duration_min: null, temperature_c: null }],
    };
    const { dsl } = buildDsl(recipe);
    // Non-curated prep slug omitted from descriptor.
    expect(dsl).toContain('@ingredient(1, tomato, 1:count)');
  });

  it('emits duration + temperature when present on a step', () => {
    const { dsl } = buildDsl(HAPPY);
    expect(dsl).toMatch(/@step\("Sear on a hot pan\.", duration=2:min, temperature=200:c\)/);
  });

  it('falls back to servings=4 when LLM omits it', () => {
    const recipe: ExtractedRecipe = {
      ...HAPPY,
      servings: null,
    };
    const { dsl } = buildDsl(recipe);
    expect(dsl).toContain('servings=4');
  });
});
