/**
 * `food.fridge.*` tRPC router — PRD-147.
 *
 * Two queries:
 *   - `view`               — the sectioned fridge view (location → ingredient → batch).
 *   - `recipesUsingBatch`  — the "Cook now" picker for a single batch row.
 */

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { FridgeViewInputSchema, RecipesUsingBatchInputSchema } from './inputs.js';
import { recipesUsingBatch } from './recipes-using-batch.js';
import { fridgeView } from './view.js';

import type { FridgeView, RecipeForCookRow } from '@pops/app-food-db';

export const fridgeRouter = router({
  view: protectedProcedure.input(FridgeViewInputSchema).query(({ input }): FridgeView => {
    return fridgeView(getDrizzle(), input);
  }),

  recipesUsingBatch: protectedProcedure
    .input(RecipesUsingBatchInputSchema)
    .query(({ input }): { items: readonly RecipeForCookRow[] } => {
      return recipesUsingBatch(getDrizzle(), input.batchId, input.limit);
    }),
});
