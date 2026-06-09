import { and, asc, eq, like, or, type SQL } from 'drizzle-orm';

import {
  ingredientWeights,
  type IngredientWeightRow,
  unitConversions,
  type UnitConversionRow,
} from '../schema.js';

import type { FoodDb } from './internal.js';

export interface ListUnitConversionsInput {
  search?: string;
  seededOnly?: boolean;
}

export function listUnitConversions(
  db: FoodDb,
  input: ListUnitConversionsInput = {}
): UnitConversionRow[] {
  const where = buildUnitsWhere(input);
  const q = db.select().from(unitConversions);
  return (where ? q.where(where) : q)
    .orderBy(asc(unitConversions.fromUnit), asc(unitConversions.toUnit))
    .all();
}

function buildUnitsWhere(input: ListUnitConversionsInput): SQL | undefined {
  const filters: SQL[] = [];
  if (input.search !== undefined && input.search.length > 0) {
    const needle = `%${input.search}%`;
    const search = or(like(unitConversions.fromUnit, needle), like(unitConversions.toUnit, needle));
    if (search !== undefined) filters.push(search);
  }
  if (input.seededOnly === true) filters.push(eq(unitConversions.isSeeded, 1));
  return combineFilters(filters);
}

function combineFilters(filters: SQL[]): SQL | undefined {
  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  return and(...filters);
}

export interface ListIngredientWeightsInput {
  ingredientId?: number;
  search?: string;
  seededOnly?: boolean;
}

export function listIngredientWeights(
  db: FoodDb,
  input: ListIngredientWeightsInput = {}
): IngredientWeightRow[] {
  const filters: SQL[] = [];
  if (input.ingredientId !== undefined) {
    filters.push(eq(ingredientWeights.ingredientId, input.ingredientId));
  }
  if (input.search !== undefined && input.search.length > 0) {
    filters.push(like(ingredientWeights.unit, `%${input.search}%`));
  }
  if (input.seededOnly === true) filters.push(eq(ingredientWeights.isSeeded, 1));
  const where = combineFilters(filters);
  const q = db.select().from(ingredientWeights);
  return (where ? q.where(where) : q)
    .orderBy(asc(ingredientWeights.ingredientId), asc(ingredientWeights.unit))
    .all();
}
