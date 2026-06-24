import { describe, expect, expectTypeOf, it } from 'vitest';

import { FoodErrorSchema } from '../errors.js';
import { IngredientSchema } from '../schemas/ingredient.js';
import { MealPlanSchema } from '../schemas/meal-plan.js';
import { RecipeSchema } from '../schemas/recipe.js';

import type { z } from 'zod';

import type { FoodError } from '../errors.js';
import type { Ingredient } from '../types/ingredient.js';
import type { MealPlan } from '../types/meal-plan.js';
import type { Recipe } from '../types/recipe.js';

describe('@pops/food contract round-trip', () => {
  it('Recipe ↔ RecipeSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof RecipeSchema>>().toEqualTypeOf<Recipe>();
  });

  it('MealPlan ↔ MealPlanSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof MealPlanSchema>>().toEqualTypeOf<MealPlan>();
  });

  it('Ingredient ↔ IngredientSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof IngredientSchema>>().toEqualTypeOf<Ingredient>();
  });

  it('FoodError ↔ FoodErrorSchema agree structurally', () => {
    expectTypeOf<z.infer<typeof FoodErrorSchema>>().toEqualTypeOf<FoodError>();
  });

  it('RecipeSchema accepts a well-formed payload', () => {
    const payload: Recipe = {
      id: 'rcp_1',
      name: 'Pad Thai',
      ingredients: ['200g rice noodles', '2 tbsp fish sauce', '1 egg'],
      instructions: '1. Soak noodles. 2. Stir-fry.',
      tagIds: ['tag_thai', 'tag_noodles'],
      source: 'https://example.com/pad-thai',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(RecipeSchema.parse(payload)).toEqual(payload);
  });

  it('RecipeSchema accepts a payload with no ingredients, no tags, and a null source', () => {
    const payload: Recipe = {
      id: 'rcp_2',
      name: 'Untitled',
      ingredients: [],
      instructions: '',
      tagIds: [],
      source: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(RecipeSchema.parse(payload)).toEqual(payload);
  });

  it('RecipeSchema rejects a non-ISO-8601 lastEditedTime', () => {
    const bad: Recipe = {
      id: 'rcp_1',
      name: 'x',
      ingredients: [],
      instructions: '',
      tagIds: [],
      source: null,
      lastEditedTime: '12 June 2026',
    };

    expect(() => RecipeSchema.parse(bad)).toThrow();
  });

  it('RecipeSchema rejects a missing name', () => {
    const bad = {
      id: 'rcp_1',
      ingredients: [],
      instructions: '',
      tagIds: [],
      source: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => RecipeSchema.parse(bad)).toThrow();
  });

  it('RecipeSchema rejects a non-string id', () => {
    const bad = {
      id: 42,
      name: 'x',
      ingredients: [],
      instructions: '',
      tagIds: [],
      source: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => RecipeSchema.parse(bad)).toThrow();
  });

  it('RecipeSchema rejects a non-string ingredient line', () => {
    const bad = {
      id: 'rcp_1',
      name: 'x',
      ingredients: ['ok', 42],
      instructions: '',
      tagIds: [],
      source: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => RecipeSchema.parse(bad)).toThrow();
  });

  it('RecipeSchema rejects a non-string tagId', () => {
    const bad = {
      id: 'rcp_1',
      name: 'x',
      ingredients: [],
      instructions: '',
      tagIds: ['tag_ok', 7],
      source: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => RecipeSchema.parse(bad)).toThrow();
  });

  it('MealPlanSchema accepts a well-formed payload', () => {
    const payload: MealPlan = {
      id: 'mp_1',
      date: '2026-06-12',
      mealType: 'dinner',
      recipeId: 'rcp_1',
      notes: 'Use leftover noodles.',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(MealPlanSchema.parse(payload)).toEqual(payload);
  });

  it('MealPlanSchema accepts a payload with a null recipeId and null notes', () => {
    const payload: MealPlan = {
      id: 'mp_2',
      date: '2026-06-13',
      mealType: 'snack',
      recipeId: null,
      notes: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(MealPlanSchema.parse(payload)).toEqual(payload);
  });

  it('MealPlanSchema rejects an unknown mealType', () => {
    const bad = {
      id: 'mp_1',
      date: '2026-06-12',
      mealType: 'brunch',
      recipeId: null,
      notes: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => MealPlanSchema.parse(bad)).toThrow();
  });

  it('MealPlanSchema rejects a non-date-only date string', () => {
    const bad = {
      id: 'mp_1',
      date: '2026-06-12T00:00:00.000Z',
      mealType: 'lunch',
      recipeId: null,
      notes: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => MealPlanSchema.parse(bad)).toThrow();
  });

  it('MealPlanSchema rejects a missing mealType', () => {
    const bad = {
      id: 'mp_1',
      date: '2026-06-12',
      recipeId: null,
      notes: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => MealPlanSchema.parse(bad)).toThrow();
  });

  it('IngredientSchema accepts a well-formed payload', () => {
    const payload: Ingredient = {
      id: 'ing_1',
      name: 'Olive oil',
      category: 'Pantry',
      unit: 'ml',
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(IngredientSchema.parse(payload)).toEqual(payload);
  });

  it('IngredientSchema accepts a payload with null category and unit', () => {
    const payload: Ingredient = {
      id: 'ing_2',
      name: 'Mystery',
      category: null,
      unit: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(IngredientSchema.parse(payload)).toEqual(payload);
  });

  it('IngredientSchema rejects a non-string id', () => {
    const bad = {
      id: 99,
      name: 'x',
      category: null,
      unit: null,
      lastEditedTime: '2026-06-12T00:00:00.000Z',
    };

    expect(() => IngredientSchema.parse(bad)).toThrow();
  });

  it('IngredientSchema rejects a non-ISO-8601 lastEditedTime', () => {
    const bad = {
      id: 'ing_1',
      name: 'x',
      category: null,
      unit: null,
      lastEditedTime: 'yesterday',
    };

    expect(() => IngredientSchema.parse(bad)).toThrow();
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
