/**
 * PRD-127 — mapJsonLdToDsl unit tests.
 */
import { describe, expect, it } from 'vitest';

import { parseRecipeDsl } from '../../dsl/index.js';
import { mapJsonLdToDsl } from '../handlers/web/map-to-dsl.js';

import type { RecipeJsonLd } from '../handlers/web/extract-json-ld.js';

const MINIMAL_RECIPE: RecipeJsonLd = {
  '@type': 'Recipe',
  name: 'Test Recipe',
  recipeYield: '4 servings',
  prepTime: 'PT5M',
  cookTime: 'PT10M',
  recipeIngredient: ['500g flour', '5g salt'],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Combine the dry.' },
    { '@type': 'HowToStep', text: 'Mix and rest.' },
  ],
};

describe('mapJsonLdToDsl', () => {
  it('produces a DSL that parses cleanly', () => {
    const { dsl } = mapJsonLdToDsl(MINIMAL_RECIPE);
    const parsed = parseRecipeDsl(dsl);
    expect(parsed.ok).toBe(true);
  });

  it('emits the yield with the recipe slug as descriptor', () => {
    const { dsl, slug } = mapJsonLdToDsl(MINIMAL_RECIPE);
    expect(slug).toBe('test-recipe');
    expect(dsl).toMatch(/^@yield\(test-recipe, /m);
  });

  it('suffixes the slug when a collision is reserved', () => {
    const reserved = new Set(['test-recipe']);
    const { slug } = mapJsonLdToDsl(MINIMAL_RECIPE, { reservedSlugs: reserved });
    expect(slug).toBe('test-recipe-2');
  });

  it('walks the suffix chain when -2 is also taken', () => {
    const reserved = new Set(['test-recipe', 'test-recipe-2']);
    const { slug } = mapJsonLdToDsl(MINIMAL_RECIPE, { reservedSlugs: reserved });
    expect(slug).toBe('test-recipe-3');
  });

  it('falls back to recipe-named yield default unit when not provided', () => {
    const { dsl } = mapJsonLdToDsl({
      '@type': 'Recipe',
      name: 'Tiny',
      recipeIngredient: ['1 thing'],
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Do it.' }],
    });
    expect(dsl).toMatch(/@yield\(tiny, 4:serving\)/);
  });

  it('drops missing prep_time / cook_time / summary cleanly', () => {
    const { dsl } = mapJsonLdToDsl({
      '@type': 'Recipe',
      name: 'Bare',
      recipeYield: '4 servings',
      recipeIngredient: ['salt'],
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Do' }],
    });
    expect(dsl).not.toMatch(/prep_time=/);
    expect(dsl).not.toMatch(/cook_time=/);
    expect(dsl).not.toMatch(/summary=/);
  });

  it('escapes double quotes and backslashes in titles and steps', () => {
    const { dsl } = mapJsonLdToDsl({
      '@type': 'Recipe',
      name: 'He said "yes" sauce',
      recipeYield: '1 jar',
      recipeIngredient: ['1 tbsp salt'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Say "hello" to the sauce. Use a back\\slash.' },
      ],
    });
    expect(dsl).toMatch(/title="He said \\"yes\\" sauce"/);
    expect(dsl).toMatch(/@step\("Say \\"hello\\".*back\\\\slash\."\)/);
    const parsed = parseRecipeDsl(dsl);
    expect(parsed.ok).toBe(true);
  });

  it('emits one ingredient block per JSON-LD ingredient line', () => {
    const { dsl, stats } = mapJsonLdToDsl({
      '@type': 'Recipe',
      name: 'Pasta',
      recipeYield: '2 servings',
      recipeIngredient: ['200g pasta', '30ml oil', '5g salt'],
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Cook.' }],
    });
    expect(stats.ingredients).toBe(3);
    const ingredientLines = dsl.split('\n').filter((line) => line.startsWith('@ingredient('));
    expect(ingredientLines).toEqual([
      '@ingredient(1, pasta, 200:g)',
      '@ingredient(2, oil, 30:ml)',
      '@ingredient(3, salt, 5:g)',
    ]);
  });

  it('renders categories and cuisine as tag comments', () => {
    const { dsl, stats } = mapJsonLdToDsl({
      '@type': 'Recipe',
      name: 'Pad See Ew',
      recipeYield: '2 servings',
      recipeCategory: ['Main', 'Dinner'],
      recipeCuisine: 'Thai',
      recipeIngredient: ['200g noodles'],
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Cook.' }],
    });
    expect(stats.tags).toBe(3);
    expect(dsl).toMatch(/^\/\/ tag: main$/m);
    expect(dsl).toMatch(/^\/\/ tag: dinner$/m);
    expect(dsl).toMatch(/^\/\/ tag: thai$/m);
  });
});
