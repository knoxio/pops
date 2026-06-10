/**
 * Input Zod schemas for `food.cook.*` procedures.
 *
 * Shapes match PRD-144. `consumptionOverrides[]` shape is PRD-146's
 * `ConsumptionOverride` discriminated union — kept here as a Zod schema
 * so the wire boundary validates at the API edge.
 *
 * Range constraints (`scaleFactor > 0`, `yield.qty >= 0`, `rating in 1..5`)
 * are enforced server-side so the corresponding `MarkCookedError` codes
 * stay reachable. Per the PRD-142 / PRD-145 lessons, Zod's job is shape
 * + finiteness; the service is the authoritative validator for ranges.
 */

import { z } from 'zod';

const UNIT = z.enum(['g', 'ml', 'count']);
const LOCATION = z.enum(['pantry', 'fridge', 'freezer', 'other']);

const LineIndex = z.number().int().positive();

const SubstitutionEdgeId = z.number().int().positive().optional();

const ConsumptionOverrideSchema = z.discriminatedUnion('kind', [
  z.object({
    lineIndex: LineIndex,
    kind: z.literal('batch-override'),
    batchId: z.number().int().positive(),
    consumeQty: z.number().finite().nonnegative(),
    unit: UNIT,
    /** PRD-149 — substitution edge that produced this override. */
    substitutionEdgeId: SubstitutionEdgeId,
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
    /** PRD-149 — substitution edge that produced this override. */
    substitutionEdgeId: SubstitutionEdgeId,
  }),
]);

const CookYieldInputSchema = z.object({
  qty: z.number().finite(),
  unit: UNIT,
  location: LOCATION,
  /**
   * ISO 8601 datetime. Validated at the API boundary so invalid
   * timestamps fail before `markCooked` opens its transaction.
   */
  expiresAt: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
});

export const PrepareCookInputSchema = z.object({
  recipeVersionId: z.number().int().positive(),
  scaleFactor: z.number().finite(),
  planEntryId: z.number().int().positive().optional(),
});

export const MarkCookedInputSchema = z.object({
  recipeVersionId: z.number().int().positive(),
  scaleFactor: z.number().finite(),
  planEntryId: z.number().int().positive().optional(),
  yield: CookYieldInputSchema.optional(),
  rating: z.number().int().optional(),
  notes: z.string().max(1000).optional(),
  consumptionOverrides: z.array(ConsumptionOverrideSchema).optional(),
});

export type PrepareCookInput = z.infer<typeof PrepareCookInputSchema>;
export type MarkCookedInput = z.infer<typeof MarkCookedInputSchema>;
