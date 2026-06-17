/**
 * Wire-shape mirrors for the `food.conversions.*` endpoints (PRD-123
 * Phase D). Derived from the generated Hey API food SDK response types so
 * any schema change to the server output flows through to the UI without
 * manual updates.
 */
import type {
  ConversionsListUnitsResponses,
  ConversionsListWeightsResponses,
} from '../../../food-api/types.gen.js';

export type CanonicalUnit = 'g' | 'ml' | 'count';

export type UnitConversionRow = ConversionsListUnitsResponses[200]['items'][number];
export type IngredientWeightRow = ConversionsListWeightsResponses[200]['items'][number];

export interface CreateUnitInput {
  fromUnit: string;
  toUnit: CanonicalUnit;
  ratio: number;
  notes?: string;
}

export interface UpdateUnitInput {
  ratio?: number;
  notes?: string | null;
}

export interface CreateWeightInput {
  ingredientId: number;
  variantId?: number | null;
  unit: string;
  grams: number;
  notes?: string;
}

export interface UpdateWeightInput {
  grams?: number;
  notes?: string | null;
}

export const CANONICAL_UNITS: readonly CanonicalUnit[] = ['g', 'ml', 'count'];
