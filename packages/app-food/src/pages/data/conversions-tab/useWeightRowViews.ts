/**
 * Project the raw `food.conversions.listWeights` output into the
 * `WeightRowView` shape the table renders. The mapping resolves
 * ingredient names from a Map (populated by `food.ingredients.list`) and
 * variant labels via the per-ingredient `food.ingredients.get` query.
 * Lookups for missing rows fall back to a sentinel so the row still
 * renders even if the parent data load races behind.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { trpc } from '@pops/api-client';

import type { IngredientWeightRow } from './types';
import type { WeightRowView } from './WeightsTable';

interface IngredientLookup {
  byId: Map<number, { name: string; slug: string }>;
}

function uniqueIngredientIds(rows: readonly IngredientWeightRow[]): readonly number[] {
  const set = new Set<number>();
  for (const row of rows) if (row.variantId !== null) set.add(row.ingredientId);
  return Array.from(set);
}

function useVariantLookup(ingredientIds: readonly number[]): Map<number, string> {
  // `trpc.useQueries` runs a known-length array in parallel; the array
  // shape is stable across renders (memoised by caller). React Query
  // dedupes identical queries so repeated mounts are free.
  const queries = trpc.useQueries((tt) =>
    ingredientIds.map((id) => tt.food.ingredients.get({ idOrSlug: id }))
  );
  return useMemo(() => {
    const map = new Map<number, string>();
    for (const q of queries) {
      const data = q.data;
      if (data === undefined) continue;
      for (const variant of data.variants) map.set(variant.id, `${variant.name} (${variant.slug})`);
    }
    return map;
  }, [queries]);
}

export function useWeightRowViews(
  rows: readonly IngredientWeightRow[],
  ingredients: IngredientLookup
): readonly WeightRowView[] {
  const { t } = useTranslation('food');
  const ingredientIds = useMemo(() => uniqueIngredientIds(rows), [rows]);
  const variantLookup = useVariantLookup(ingredientIds);

  return useMemo(() => {
    const anyLabel = t('data.conversions.weights.anyVariant');
    return rows.map<WeightRowView>((row) => {
      const ingredient = ingredients.byId.get(row.ingredientId);
      const variantLabel =
        row.variantId === null
          ? anyLabel
          : (variantLookup.get(row.variantId) ?? `#${row.variantId}`);
      return {
        row,
        ingredientName: ingredient?.name ?? `#${row.ingredientId}`,
        variantLabel,
      };
    });
  }, [rows, ingredients, variantLookup, t]);
}

export function buildIngredientLookup(
  rows: readonly { id: number; name: string; slug: string }[]
): IngredientLookup {
  const byId = new Map<number, { name: string; slug: string }>();
  for (const row of rows) byId.set(row.id, { name: row.name, slug: row.slug });
  return { byId };
}
