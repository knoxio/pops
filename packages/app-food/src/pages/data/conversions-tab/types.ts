/**
 * Wire-shape mirrors for the `food.conversions.*` tRPC procedures
 * (PRD-123 Phase B). Frontend cannot import from `apps/pops-api/src/...`
 * so the shape is restated here. Drift is caught by Phase B's integration
 * suite asserting the router output schema, and by tsc against the
 * useQuery/useMutation generics at the call site.
 */
export type CanonicalUnit = 'g' | 'ml' | 'count';

export interface UnitConversionRow {
  id: number;
  fromUnit: string;
  toUnit: CanonicalUnit;
  ratio: number;
  notes: string | null;
  seeded: boolean;
  createdAt: string;
}

export interface IngredientWeightRow {
  id: number;
  ingredientId: number;
  variantId: number | null;
  unit: string;
  grams: number;
  notes: string | null;
  seeded: boolean;
  createdAt: string;
}

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
