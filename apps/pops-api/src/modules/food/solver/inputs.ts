/**
 * Zod input schema for `food.solver.canICook` — PRD-150.
 *
 * All filters are optional. The `recipeTypes` enum mirrors
 * `recipes.recipe_type` so an invalid type fails fast at the boundary
 * instead of producing an empty result set.
 */

import { z } from 'zod';

const RecipeType = z.enum([
  'plate',
  'component',
  'technique',
  'sauce',
  'dressing',
  'drink',
  'condiment',
]);

export const CanICookInputSchema = z.object({
  excludeSubs: z.boolean().optional(),
  recipeTypes: z.array(RecipeType).max(7).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(32).optional(),
  maxMinutes: z
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .optional(),
});

export type CanICookInput = z.infer<typeof CanICookInputSchema>;
