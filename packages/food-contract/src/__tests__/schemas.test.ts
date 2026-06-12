import { describe, expect, expectTypeOf, it } from 'vitest';

import { FoodErrorSchema } from '../errors.js';
import { RecipeSchema } from '../schemas/recipe.js';

import type { z } from 'zod';

import type { FoodError } from '../errors.js';
import type { Recipe } from '../types/recipe.js';

describe('@pops/food-contract round-trip', () => {
  it('Recipe ↔ RecipeSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof RecipeSchema>>().toEqualTypeOf<Recipe>();
  });

  it('FoodError ↔ FoodErrorSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof FoodErrorSchema>>().toEqualTypeOf<FoodError>();
  });

  it('RecipeSchema accepts a well-formed payload', () => {
    const payload: Recipe = {
      id: 'rcp_1',
      name: 'Pad Thai',
      servings: 4,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(RecipeSchema.parse(payload)).toEqual(payload);
  });

  it('RecipeSchema accepts a payload with null servings', () => {
    const payload: Recipe = {
      id: 'rcp_1',
      name: 'Untitled',
      servings: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(RecipeSchema.parse(payload)).toEqual(payload);
  });

  it('RecipeSchema rejects a non-ISO-8601 lastEditedTime', () => {
    const bad: Recipe = {
      id: 'rcp_1',
      name: 'x',
      servings: null,
      lastEditedTime: '12 June 2026',
    };

    expect(() => RecipeSchema.parse(bad)).toThrow();
  });

  it('RecipeSchema rejects a missing name', () => {
    const bad = {
      id: 'rcp_1',
      servings: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => RecipeSchema.parse(bad)).toThrow();
  });

  it('RecipeSchema rejects a non-string id', () => {
    const bad = {
      id: 42,
      name: 'x',
      servings: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => RecipeSchema.parse(bad)).toThrow();
  });

  it('RecipeSchema rejects a non-numeric servings', () => {
    const bad = {
      id: 'rcp_1',
      name: 'x',
      servings: 'four',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => RecipeSchema.parse(bad)).toThrow();
  });

  it('FoodErrorSchema accepts ContractStatus envelope', () => {
    expect(FoodErrorSchema.parse({ kind: 'unavailable' })).toEqual({ kind: 'unavailable' });
  });

  it('FoodErrorSchema accepts an unknown-recipe domain error', () => {
    const err: FoodError = { kind: 'unknown-recipe', recipeId: 'rcp_1' };
    expect(FoodErrorSchema.parse(err)).toEqual(err);
  });

  it('FoodErrorSchema accepts a recipe-archived domain error', () => {
    const err: FoodError = { kind: 'recipe-archived', recipeId: 'rcp_1' };
    expect(FoodErrorSchema.parse(err)).toEqual(err);
  });

  it('FoodErrorSchema rejects an unknown kind', () => {
    expect(() => FoodErrorSchema.parse({ kind: 'mystery' })).toThrow();
  });
});
