/**
 * Wire-shape mirrors for the `food.conversions.*` tRPC procedures
 * (PRD-123 Phase B). Derived from `AppRouter` via `inferRouterOutputs` so
 * any schema change to the router output (`conversions/types.ts` on the
 * server) flows through to the UI without manual updates.
 */
import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';

type ConversionsOutputs = inferRouterOutputs<AppRouter>['food']['conversions'];

export type CanonicalUnit = 'g' | 'ml' | 'count';

export type UnitConversionRow = ConversionsOutputs['listUnits']['items'][number];
export type IngredientWeightRow = ConversionsOutputs['listWeights']['items'][number];

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
