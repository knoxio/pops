/**
 * `food.shopping.*` tRPC router — PRD-152.
 *
 * Two procedures:
 *   - `previewFromPlan` (query) — computes the picker view (preview + count).
 *   - `generateFromPlan` (mutation) — re-runs the preview then writes a new
 *     shopping list transactionally.
 */
import { TRPCError } from '@trpc/server';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { generateFromPlan } from './generate.js';
import { GenerateFromPlanInputSchema, PreviewFromPlanInputSchema } from './inputs.js';
import { previewFromPlan } from './preview.js';
import { type GenerateResult, type GeneratorPreview } from './types.js';

export const shoppingRouter = router({
  previewFromPlan: protectedProcedure
    .input(PreviewFromPlanInputSchema)
    .query(({ input }): GeneratorPreview => {
      const result = previewFromPlan(getDrizzle(), input);
      if (!result.ok) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.reason });
      }
      return result.preview;
    }),

  generateFromPlan: protectedProcedure
    .input(GenerateFromPlanInputSchema)
    .mutation(({ input }): GenerateResult => generateFromPlan(getDrizzle(), input)),
});
