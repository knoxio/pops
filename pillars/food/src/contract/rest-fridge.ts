/**
 * `fridge.*` sub-router — PRD-147 fridge/pantry view + the "recipes using
 * this batch" lookup. `view` is `POST`-with-body (its filter set carries a
 * locations array + several booleans that ride a body more cleanly than
 * query params); it is a pure read. Both are read-only.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { QueryPositiveInt } from './rest-schemas.js';

const c = initContract();

const Unit = z.enum(['g', 'ml', 'count']);
const Location = z.enum(['pantry', 'fridge', 'freezer', 'other']);
const SourceType = z.enum(['purchase', 'recipe_run', 'gift', 'other']);

const FridgeBatchRowSchema = z.object({
  id: z.number().int().positive(),
  variantName: z.string().nullable(),
  variantSlug: z.string().nullable(),
  prepStateLabel: z.string().nullable(),
  qtyRemaining: z.number(),
  unit: Unit,
  expiresAt: z.string().nullable(),
  daysToExpiry: z.number().int().nullable(),
  producedAt: z.string(),
  sourceType: SourceType,
  sourceRecipeSlug: z.string().nullable(),
  notes: z.string().nullable(),
  deletedAt: z.string().nullable(),
});

const FridgeIngredientGroupSchema = z.object({
  ingredientId: z.number().int().positive(),
  ingredientName: z.string(),
  ingredientSlug: z.string(),
  batches: z.array(FridgeBatchRowSchema).readonly(),
});

const FridgeLocationSectionSchema = z.object({
  location: Location,
  count: z.number().int(),
  ingredients: z.array(FridgeIngredientGroupSchema).readonly(),
});

const FridgeViewSchema = z.object({
  sections: z.array(FridgeLocationSectionSchema).readonly(),
  counts: z.object({
    visible: z.number().int(),
    empty: z.number().int(),
    deleted: z.number().int(),
  }),
});

const RecipeForCookRowSchema = z.object({
  recipeId: z.number().int().positive(),
  recipeSlug: z.string(),
  title: z.string(),
  recipeType: z.string().nullable(),
  lineCount: z.number().int(),
  recipeNeedsQty: z.number().nullable(),
  lastCookedAt: z.string().nullable(),
});

export const foodFridgeContract = c.router({
  view: {
    method: 'POST',
    path: '/fridge/view',
    body: z.object({
      search: z.string().trim().max(120).optional(),
      locations: z.array(Location).min(1).max(4).optional(),
      expiringSoon: z.boolean().optional(),
      recipeYieldedOnly: z.boolean().optional(),
      includeEmpty: z.boolean().optional(),
      includeDeleted: z.boolean().optional(),
    }),
    responses: { 200: FridgeViewSchema },
    summary: 'Fridge/pantry view grouped by location → ingredient → batch',
  },
  recipesUsingBatch: {
    method: 'GET',
    path: '/fridge/recipes-using-batch',
    query: z.object({
      batchId: QueryPositiveInt,
      limit: z.coerce.number().int().positive().max(100).optional(),
    }),
    responses: { 200: z.object({ items: z.array(RecipeForCookRowSchema).readonly() }) },
    summary: 'Recipes that reference the batch’s variant (FIFO cook suggestions)',
  },
});
