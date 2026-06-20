/**
 * Pure-zod schemas for the `cook.*` REST surface (PRD-144 / PRD-146 / PRD-149).
 *
 * Lives in `contract/` (zod-only — no `src/api/` or `src/db/` imports) so it
 * honours the package boundary and can be imported by both the ts-rest
 * contract and the lifted procedures.
 *
 * Input range constraints (`scaleFactor > 0`, `yield.qty >= 0`, `rating in
 * 1..5`) are enforced server-side in `markCooked` so the corresponding
 * `MarkCookedError` codes stay reachable. Per the PRD-142 / PRD-145 lesson,
 * zod's job here is shape + finiteness; the service is the authoritative
 * range validator.
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

const CookYieldDefaultSchema = z.object({
  qty: z.number(),
  unit: UNIT,
  variantName: z.string().nullable(),
  prepStateLabel: z.string().nullable(),
  shelfLifeFridgeDays: z.number().nullable(),
  shelfLifeFreezerDays: z.number().nullable(),
});

const LineConsumeNeedSchema = z.object({
  lineIndex: z.number().int(),
  ingredientId: z.number().int(),
  ingredientName: z.string(),
  variantId: z.number().int(),
  variantName: z.string(),
  prepStateId: z.number().int().nullable(),
  prepStateLabel: z.string().nullable(),
  qty: z.number(),
  canonicalUnit: UNIT,
  optional: z.boolean(),
});

export const CookPreparationSchema = z.object({
  recipeTitle: z.string(),
  recipeSlug: z.string(),
  versionNo: z.number().int(),
  defaultScaleFactor: z.number(),
  yieldsBatch: z.boolean(),
  yieldDefault: CookYieldDefaultSchema.nullable(),
  consumeNeeds: z.array(LineConsumeNeedSchema),
  alreadyCooked: z.boolean(),
});

const MarkCookedErrorSchema = z.enum([
  'RecipeVersionNotFound',
  'RecipeNotCompiled',
  'PlanEntryNotFound',
  'PlanEntryAlreadyCooked',
  'YieldRequired',
  'YieldForbidden',
  'BadScaleFactor',
  'BadYieldQty',
  'BadRating',
  'BadExpiry',
  'ShortfallUnresolved',
  'SubstitutionEdgeInvalid',
]);

const ShortfallSchema = z.object({
  variantId: z.number().int(),
  prepStateId: z.number().int().nullable(),
  needed: z.number(),
  available: z.number(),
  unit: UNIT,
});

export const MarkCookedResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    recipeRunId: z.number().int(),
    yieldedBatchId: z.number().int().nullable(),
  }),
  z.object({
    ok: z.literal(false),
    reason: MarkCookedErrorSchema,
    shortfalls: z.array(ShortfallSchema).optional(),
  }),
]);
