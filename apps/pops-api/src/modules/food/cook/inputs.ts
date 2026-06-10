/**
 * Input Zod schemas for `food.cook.*` procedures.
 *
 * Shapes match PRD-144. `consumptionOverrides[]` shape is PRD-146's
 * `ConsumptionOverride` discriminated union — kept here as a Zod schema
 * so the wire boundary validates at the API edge.
 */

import { z } from 'zod';

const UNIT = z.enum(['g', 'ml', 'count']);
const LOCATION = z.enum(['pantry', 'fridge', 'freezer', 'other']);

const LineIndex = z.number().int().positive();

const ConsumptionOverrideSchema = z.discriminatedUnion('kind', [
  z.object({
    lineIndex: LineIndex,
    kind: z.literal('batch-override'),
    batchId: z.number().int().positive(),
    consumeQty: z.number().finite().nonnegative(),
    unit: UNIT,
  }),
  z.object({
    lineIndex: LineIndex,
    kind: z.literal('external'),
    externalQty: z.number().finite().nonnegative(),
    externalUnit: UNIT,
  }),
  z.object({
    lineIndex: LineIndex,
    kind: z.literal('partial'),
    batchId: z.number().int().positive(),
    consumeQty: z.number().finite().nonnegative(),
    externalQty: z.number().finite().nonnegative(),
    unit: UNIT,
  }),
]);

const CookYieldInputSchema = z.object({
  qty: z.number().finite().nonnegative(),
  unit: UNIT,
  location: LOCATION,
  /**
   * ISO 8601 datetime. Validated at the API boundary so invalid
   * timestamps fail before `markCooked` opens its transaction.
   * Same convention as `apps/pops-api/src/modules/food/routers/ingest-schemas.ts`.
   */
  expiresAt: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
});

export const PrepareCookInputSchema = z.object({
  recipeVersionId: z.number().int().positive(),
  scaleFactor: z.number().finite().positive(),
  planEntryId: z.number().int().positive().optional(),
});

export const MarkCookedInputSchema = z.object({
  recipeVersionId: z.number().int().positive(),
  scaleFactor: z.number().finite().positive(),
  planEntryId: z.number().int().positive().optional(),
  yield: CookYieldInputSchema.optional(),
  rating: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(1000).optional(),
  consumptionOverrides: z.array(ConsumptionOverrideSchema).optional(),
});

export type PrepareCookInput = z.infer<typeof PrepareCookInputSchema>;
export type MarkCookedInput = z.infer<typeof MarkCookedInputSchema>;
