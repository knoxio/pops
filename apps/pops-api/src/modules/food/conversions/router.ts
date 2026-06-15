import { z } from 'zod';

import { conversionsQueries, conversionsService } from '@pops/app-food-db';

import { getFoodDrizzle } from '../../../db/food-handle.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { runCreate, runDelete, runUpdate } from './error-mapping.js';
import {
  CanonicalUnitSchema,
  IngredientWeightSchema,
  ResolveResultSchema,
  toIngredientWeight,
  toUnitConversion,
  UnitConversionSchema,
} from './types.js';

const OkSchema = z.object({ ok: z.literal(true) });
const DeleteResultSchema = z.discriminatedUnion('ok', [
  OkSchema,
  z.object({ ok: z.literal(false), reason: z.literal('seeded') }),
]);

const CreateUnitInputSchema = z.object({
  fromUnit: z.string().min(1),
  toUnit: CanonicalUnitSchema,
  ratio: z.number().positive(),
  notes: z.string().optional(),
});

const UpdateUnitInputSchema = z.object({
  id: z.number().int().positive(),
  ratio: z.number().positive().optional(),
  notes: z.string().nullable().optional(),
});

const CreateWeightInputSchema = z.object({
  ingredientId: z.number().int().positive(),
  variantId: z.number().int().positive().nullish(),
  unit: z.string().min(1),
  grams: z.number().positive(),
  notes: z.string().optional(),
});

const UpdateWeightInputSchema = z.object({
  id: z.number().int().positive(),
  grams: z.number().positive().optional(),
  notes: z.string().nullable().optional(),
});

const ResolveInputSchema = z.object({
  ingredientId: z.number().int().positive(),
  variantId: z.number().int().positive().nullish(),
  unit: z.string().min(1),
  qty: z.number(),
});

export const conversionsRouter = router({
  /** ----- unit_conversions ----- */
  listUnits: protectedProcedure
    .input(
      z.object({ search: z.string().optional(), seededOnly: z.boolean().optional() }).optional()
    )
    .output(z.object({ items: z.array(UnitConversionSchema) }))
    .query(({ input }) => ({
      items: conversionsQueries
        .listUnitConversions(getFoodDrizzle(), input ?? {})
        .map(toUnitConversion),
    })),

  createUnit: protectedProcedure
    .input(CreateUnitInputSchema)
    .output(z.object({ data: UnitConversionSchema }))
    .mutation(({ input }) => ({
      data: toUnitConversion(
        runCreate('unit_conversion', () =>
          conversionsService.createUnitConversion(getFoodDrizzle(), input)
        )
      ),
    })),

  updateUnit: protectedProcedure
    .input(UpdateUnitInputSchema)
    .output(z.object({ data: UnitConversionSchema }))
    .mutation(({ input }) => {
      const { id, ...patch } = input;
      return {
        data: toUnitConversion(
          runUpdate('unit_conversion', id, () =>
            conversionsService.updateUnitConversion(getFoodDrizzle(), id, patch)
          )
        ),
      };
    }),

  deleteUnit: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .output(DeleteResultSchema)
    .mutation(({ input }) =>
      runDelete(() => conversionsService.deleteUnitConversion(getFoodDrizzle(), input.id))
    ),

  /** ----- ingredient_weights ----- */
  listWeights: protectedProcedure
    .input(
      z
        .object({
          ingredientId: z.number().int().positive().optional(),
          search: z.string().optional(),
          seededOnly: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ items: z.array(IngredientWeightSchema) }))
    .query(({ input }) => ({
      items: conversionsQueries
        .listIngredientWeights(getFoodDrizzle(), input ?? {})
        .map(toIngredientWeight),
    })),

  createWeight: protectedProcedure
    .input(CreateWeightInputSchema)
    .output(z.object({ data: IngredientWeightSchema }))
    .mutation(({ input }) => ({
      data: toIngredientWeight(
        runCreate('ingredient_weight', () =>
          conversionsService.createIngredientWeight(getFoodDrizzle(), input)
        )
      ),
    })),

  updateWeight: protectedProcedure
    .input(UpdateWeightInputSchema)
    .output(z.object({ data: IngredientWeightSchema }))
    .mutation(({ input }) => {
      const { id, ...patch } = input;
      return {
        data: toIngredientWeight(
          runUpdate('ingredient_weight', id, () =>
            conversionsService.updateIngredientWeight(getFoodDrizzle(), id, patch)
          )
        ),
      };
    }),

  deleteWeight: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .output(DeleteResultSchema)
    .mutation(({ input }) =>
      runDelete(() => conversionsService.deleteIngredientWeight(getFoodDrizzle(), input.id))
    ),

  resolve: protectedProcedure
    .input(ResolveInputSchema)
    .output(ResolveResultSchema)
    .query(({ input }) =>
      conversionsService.resolveCanonicalQty(getFoodDrizzle(), {
        ingredientId: input.ingredientId,
        variantId: input.variantId ?? null,
        unit: input.unit,
        qty: input.qty,
      })
    ),
});
