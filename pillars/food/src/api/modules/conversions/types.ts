import type { z } from 'zod';

/**
 * Row → wire mappers for the `conversions.*` REST surface. Boolean
 * `seeded` is the client-facing camelCase mirror of the DB's INTEGER
 * `is_seeded` column.
 */
import type {
  IngredientWeightSchema,
  UnitConversionSchema,
} from '../../../contract/rest-conversions.js';
import type { IngredientWeightRow, UnitConversionRow } from '../../../db/index.js';

export type UnitConversion = z.infer<typeof UnitConversionSchema>;
export type IngredientWeight = z.infer<typeof IngredientWeightSchema>;

export function toUnitConversion(row: UnitConversionRow): UnitConversion {
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

export function toIngredientWeight(row: IngredientWeightRow): IngredientWeight {
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
