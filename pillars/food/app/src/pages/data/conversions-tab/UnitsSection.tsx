/**
 * Unit-conversions sub-section. Owns the search box + seeded-only toggle
 * + the Add button + the inline edit/delete state. List data comes from
 * `food.conversions.listUnits`; mutations route through `useUnitMutations`.
 */
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Checkbox, Label, TextInput } from '@pops/ui';

import { unwrap } from '../../../food-api-helpers.js';
import { conversionsListUnits } from '../../../food-api/index.js';
import { CreateUnitDialog, EditUnitDialog } from './UnitDialogs';
import { UnitsTable } from './UnitsTable';
import { useUnitMutations } from './useUnitMutations';

import type { UnitConversionRow } from './types';

function useUnitFilters() {
  const [search, setSearch] = useState('');
  const [seededOnly, setSeededOnly] = useState(false);
  return { search, setSearch, seededOnly, setSeededOnly };
}

function FilterRow({
  search,
  onSearchChange,
  seededOnly,
  onSeededOnlyChange,
}: {
  search: string;
  onSearchChange: (next: string) => void;
  seededOnly: boolean;
  onSeededOnlyChange: (next: boolean) => void;
}) {
  const { t } = useTranslation('food');
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid w-full max-w-sm gap-1.5">
        <Label htmlFor="units-search">{t('data.conversions.units.searchLabel')}</Label>
        <TextInput
          id="units-search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('data.conversions.units.searchPlaceholder')}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="units-seeded-only"
          checked={seededOnly}
          onCheckedChange={(next) => onSeededOnlyChange(next === true)}
        />
        <Label htmlFor="units-seeded-only">{t('data.conversions.seededOnly')}</Label>
      </div>
    </div>
  );
}

function SectionHeader({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation('food');
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">{t('data.conversions.units.title')}</h2>
        <p className="text-muted-foreground text-sm">{t('data.conversions.units.description')}</p>
      </div>
      <Button size="sm" onClick={onAdd}>
        {t('data.conversions.units.add')}
      </Button>
    </header>
  );
}

interface DialogState {
  createOpen: boolean;
  editingRow: UnitConversionRow | null;
  openCreate: () => void;
  closeCreate: () => void;
  startEdit: (row: UnitConversionRow) => void;
  cancelEdit: () => void;
}

function useDialogState(clearError: () => void): DialogState {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<UnitConversionRow | null>(null);
  const openCreate = useCallback(() => setCreateOpen(true), []);
  const closeCreate = useCallback(() => {
    clearError();
    setCreateOpen(false);
  }, [clearError]);
  const startEdit = useCallback((row: UnitConversionRow) => setEditingRow(row), []);
  const cancelEdit = useCallback(() => {
    clearError();
    setEditingRow(null);
  }, [clearError]);
  return { createOpen, editingRow, openCreate, closeCreate, startEdit, cancelEdit };
}

export function UnitsSection() {
  const { t } = useTranslation('food');
  const filters = useUnitFilters();
  const listInput = {
    search: filters.search.length > 0 ? filters.search : undefined,
    seededOnly: filters.seededOnly ? true : undefined,
  };
  const listQuery = useQuery({
    queryKey: ['food', 'conversions', 'listUnits', listInput],
    queryFn: async () => unwrap(await conversionsListUnits({ query: listInput })),
  });
  const mutations = useUnitMutations();
  const dialog = useDialogState(mutations.clearError);

  const showInlineError =
    mutations.errorMessage !== null && !dialog.createOpen && dialog.editingRow === null;

  return (
    <section aria-label={t('data.conversions.units.title')} className="space-y-4">
      <SectionHeader onAdd={dialog.openCreate} />
      <FilterRow
        search={filters.search}
        onSearchChange={filters.setSearch}
        seededOnly={filters.seededOnly}
        onSeededOnlyChange={filters.setSeededOnly}
      />
      {showInlineError ? (
        <p role="alert" className="text-destructive text-sm">
          {mutations.errorMessage}
        </p>
      ) : null}
      <UnitsTable
        rows={listQuery.data?.items ?? []}
        isLoading={listQuery.isLoading}
        onEdit={dialog.startEdit}
        onDelete={(row) => mutations.submitDelete(row.id)}
      />
      <CreateUnitDialog
        open={dialog.createOpen}
        onOpenChange={(open) => (open ? dialog.openCreate() : dialog.closeCreate())}
        errorMessage={mutations.errorMessage}
        isSubmitting={mutations.isCreating}
        onSubmit={(input) => mutations.submitCreate(input, dialog.closeCreate)}
      />
      <EditUnitDialog
        open={dialog.editingRow !== null}
        onOpenChange={(open) => {
          if (!open) dialog.cancelEdit();
        }}
        row={dialog.editingRow}
        errorMessage={mutations.errorMessage}
        isSubmitting={mutations.isUpdating}
        onSubmit={(id, patch) => mutations.submitUpdate(id, patch, dialog.cancelEdit)}
      />
    </section>
  );
}
