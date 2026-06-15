/**
 * Wire shapes for `food.conversions.*` procedures. Boolean `seeded` is the
 * client-facing camelCase mirror of the DB's INTEGER `is_seeded` column.
 */
import { z } from 'zod';

import type {
  CanonicalUnit,
  IngredientWeightRow as DbIngredientWeightRow,
  UnitConversionRow as DbUnitConversionRow,
} from '@pops/food-db';

export type CanonicalUnitZ = z.ZodType<CanonicalUnit>;
export const CanonicalUnitSchema: CanonicalUnitZ = z.enum(['g', 'ml', 'count']);

export const UnitConversionSchema = z.object({
  id: z.number().int().positive(),
  fromUnit: z.string(),
  toUnit: CanonicalUnitSchema,
  ratio: z.number(),
  notes: z.string().nullable(),
  seeded: z.boolean(),
  createdAt: z.string(),
});
export type UnitConversion = z.infer<typeof UnitConversionSchema>;

export const IngredientWeightSchema = z.object({
  id: z.number().int().positive(),
  ingredientId: z.number().int().positive(),
  variantId: z.number().int().positive().nullable(),
  unit: z.string(),
  grams: z.number(),
  notes: z.string().nullable(),
  seeded: z.boolean(),
  createdAt: z.string(),
});
export type IngredientWeight = z.infer<typeof IngredientWeightSchema>;

export function toUnitConversion(row: DbUnitConversionRow): UnitConversion {
  return {
    id: row.id,
    fromUnit: row.fromUnit,
    toUnit: row.toUnit,
    ratio: row.ratio,
    notes: row.notes,
    seeded: row.isSeeded === 1,
    createdAt: row.createdAt,
  };
}

export function toIngredientWeight(row: DbIngredientWeightRow): IngredientWeight {
  return {
    id: row.id,
    ingredientId: row.ingredientId,
    variantId: row.variantId,
    unit: row.unit,
    grams: row.grams,
    notes: row.notes,
    seeded: row.isSeeded === 1,
    createdAt: row.createdAt,
  };
}

/**
 * `resolve` query result — discriminated union the client narrows on.
 * `resolved` carries the canonical unit + multiplied qty; `unresolved` means
 * no row in either lookup table covered the input. Callers fall back to the
 * ingredient's `default_unit` with null canonical qty.
 */
export const ResolveResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('resolved'), canonicalUnit: CanonicalUnitSchema, qty: z.number() }),
  z.object({ kind: z.literal('unresolved') }),
]);
export type ResolveResult = z.infer<typeof ResolveResultSchema>;
