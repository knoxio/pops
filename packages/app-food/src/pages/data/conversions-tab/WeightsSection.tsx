/**
 * Ingredient-weights sub-section. Composes the search/filter row,
 * the table, the create/edit dialogs, and the lazy variant lookup.
 */
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Checkbox, Label, TextInput } from '@pops/ui';

import { unwrap } from '../../../food-api-helpers.js';
import { conversionsListWeights, ingredientsList } from '../../../food-api/index.js';

import { type IngredientOption } from './CreateWeightDialog';
import { useWeightMutations } from './useWeightMutations';
import { buildIngredientLookup, useWeightRowViews } from './useWeightRowViews';
import { WeightsDialogs } from './WeightsDialogs';
import { WeightsTable } from './WeightsTable';

import type { IngredientWeightRow } from './types';

function useWeightFilters() {
  const [search, setSearch] = useState('');
  const [seededOnly, setSeededOnly] = useState(false);
  const [ingredientFilter, setIngredientFilter] = useState<string>('');
  return { search, setSearch, seededOnly, setSeededOnly, ingredientFilter, setIngredientFilter };
}

function FilterRow({
  search,
  onSearchChange,
  seededOnly,
  onSeededOnlyChange,
  ingredientFilter,
  onIngredientFilterChange,
  ingredients,
}: {
  search: string;
  onSearchChange: (next: string) => void;
  seededOnly: boolean;
  onSeededOnlyChange: (next: boolean) => void;
  ingredientFilter: string;
  onIngredientFilterChange: (next: string) => void;
  ingredients: readonly IngredientOption[];
}) {
  const { t } = useTranslation('food');
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid w-full max-w-xs gap-1.5">
        <Label htmlFor="weights-search">{t('data.conversions.weights.searchLabel')}</Label>
        <TextInput
          id="weights-search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('data.conversions.weights.searchPlaceholder')}
        />
      </div>
      <div className="grid w-full max-w-xs gap-1.5">
        <Label htmlFor="weights-ingredient-filter">
          {t('data.conversions.weights.ingredientFilter')}
        </Label>
        <select
          id="weights-ingredient-filter"
          value={ingredientFilter}
          onChange={(e) => onIngredientFilterChange(e.target.value)}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">{t('data.conversions.weights.allIngredients')}</option>
          {ingredients.map((i) => (
            <option key={i.id} value={String(i.id)}>{`${i.name} (${i.slug})`}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="weights-seeded-only"
          checked={seededOnly}
          onCheckedChange={(next) => onSeededOnlyChange(next === true)}
        />
        <Label htmlFor="weights-seeded-only">{t('data.conversions.seededOnly')}</Label>
      </div>
    </div>
  );
}

function SectionHeader({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation('food');
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">{t('data.conversions.weights.title')}</h2>
        <p className="text-muted-foreground text-sm">{t('data.conversions.weights.description')}</p>
      </div>
      <Button size="sm" onClick={onAdd}>
        {t('data.conversions.weights.add')}
      </Button>
    </header>
  );
}

function useIngredientOptions(): readonly IngredientOption[] {
  const ingredientListQuery = useQuery({
    queryKey: ['food', 'ingredients', 'list', {}],
    queryFn: async () => unwrap(await ingredientsList({ query: {} })),
  });
  return useMemo(
    () =>
      (ingredientListQuery.data?.items ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
      })),
    [ingredientListQuery.data]
  );
}

interface DialogState {
  createOpen: boolean;
  editingRow: IngredientWeightRow | null;
  openCreate: () => void;
  closeCreate: () => void;
  startEdit: (row: IngredientWeightRow) => void;
  cancelEdit: () => void;
}

function useDialogState(clearError: () => void): DialogState {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<IngredientWeightRow | null>(null);
  const openCreate = useCallback(() => setCreateOpen(true), []);
  const closeCreate = useCallback(() => {
    clearError();
    setCreateOpen(false);
  }, [clearError]);
  const startEdit = useCallback((row: IngredientWeightRow) => setEditingRow(row), []);
  const cancelEdit = useCallback(() => {
    clearError();
    setEditingRow(null);
  }, [clearError]);
  return { createOpen, editingRow, openCreate, closeCreate, startEdit, cancelEdit };
}

function useWeightData(
  filters: ReturnType<typeof useWeightFilters>,
  ingredients: readonly IngredientOption[]
) {
  const lookup = useMemo(() => buildIngredientLookup(ingredients), [ingredients]);
  const ingredientId =
    filters.ingredientFilter.length > 0 ? Number(filters.ingredientFilter) : undefined;
  const listInput = {
    search: filters.search.length > 0 ? filters.search : undefined,
    seededOnly: filters.seededOnly ? true : undefined,
    ingredientId,
  };
  const listQuery = useQuery({
    queryKey: ['food', 'conversions', 'listWeights', listInput],
    queryFn: async () => unwrap(await conversionsListWeights({ query: listInput })),
  });
  const rawRows = listQuery.data?.items ?? [];
  const views = useWeightRowViews(rawRows, lookup);
  return { views, isLoading: listQuery.isLoading };
}

export function WeightsSection() {
  const { t } = useTranslation('food');
  const filters = useWeightFilters();
  const ingredients = useIngredientOptions();
  const { views, isLoading } = useWeightData(filters, ingredients);
  const mutations = useWeightMutations();
  const dialog = useDialogState(mutations.clearError);

  const showInlineError =
    mutations.errorMessage !== null && !dialog.createOpen && dialog.editingRow === null;

  return (
    <section aria-label={t('data.conversions.weights.title')} className="space-y-4">
      <SectionHeader onAdd={dialog.openCreate} />
      <FilterRow
        search={filters.search}
        onSearchChange={filters.setSearch}
        seededOnly={filters.seededOnly}
        onSeededOnlyChange={filters.setSeededOnly}
        ingredientFilter={filters.ingredientFilter}
        onIngredientFilterChange={filters.setIngredientFilter}
        ingredients={ingredients}
      />
      {showInlineError ? (
        <p role="alert" className="text-destructive text-sm">
          {mutations.errorMessage}
        </p>
      ) : null}
      <WeightsTable
        rows={views}
        isLoading={isLoading}
        onEdit={dialog.startEdit}
        onDelete={(row) => mutations.submitDelete(row.id)}
      />
      <WeightsDialogs
        createOpen={dialog.createOpen}
        editingRow={dialog.editingRow}
        ingredients={ingredients}
        errorMessage={mutations.errorMessage}
        isCreating={mutations.isCreating}
        isUpdating={mutations.isUpdating}
        openCreate={dialog.openCreate}
        closeCreate={dialog.closeCreate}
        cancelEdit={dialog.cancelEdit}
        submitCreate={mutations.submitCreate}
        submitUpdate={mutations.submitUpdate}
      />
    </section>
  );
}
