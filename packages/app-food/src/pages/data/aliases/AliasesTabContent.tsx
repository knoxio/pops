/**
 * `/food/data/aliases` tab content (PRD-122-C).
 *
 * Orchestrates the data hook, mutation hooks, toolbar, table, and the
 * Add/Merge dialogs. Keeps no data state of its own beyond dialog
 * open/closed — everything else lives in `useAliasesData`.
 *
 * Per Copilot review on PR #2724 — dialog `useState` setters are
 * declared BEFORE `useAliasMutations`, so the mutation hook can close
 * dialogs from its per-mutation success path. A failed create/merge
 * leaves the dialog open so the user can retry without re-typing.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AddAliasDialog } from './AddAliasDialog.js';
import { AliasesTable } from './AliasesTable.js';
import { AliasesToolbar } from './AliasesToolbar.js';
import { MergeAliasesDialog } from './MergeAliasesDialog.js';
import { useAliasesData, type UseAliasesData } from './use-aliases-data.js';
import { useAliasMutations } from './use-aliases-mutations.js';

export function AliasesTabContent() {
  const { t } = useTranslation('food');
  const data = useAliasesData();
  const [addOpen, setAddOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const mutations = useAliasMutations({
    onAnySuccess: data.clearSelection,
    onCreateSuccess: () => setAddOpen(false),
    onMergeSuccess: () => setMergeOpen(false),
  });
  const selectedRows = data.rows.filter((r) => data.selectedIds.has(r.id));

  return (
    <section className="space-y-4" aria-labelledby="aliases-tab-heading">
      <header className="space-y-1">
        <h2 id="aliases-tab-heading" className="text-xl font-semibold">
          {t('data.aliases.title')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('data.aliases.description')}</p>
      </header>

      <AliasesToolbar
        filter={data.filter}
        onFilterChange={data.setFilter}
        selectedCount={data.selectedIds.size}
        hasLlmSelection={data.hasLlmSelection}
        onAddClick={() => setAddOpen(true)}
        onMergeClick={() => setMergeOpen(true)}
        onBulkApproveClick={() =>
          mutations.bulkApprove(selectedRows.filter((r) => r.source === 'llm').map((r) => r.id))
        }
      />

      <AliasesBody data={data} mutations={mutations} />

      <AddAliasDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        isSubmitting={mutations.isCreating}
        onSubmit={(input) => mutations.createAlias(input)}
      />

      <MergeAliasesDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        selectedAliases={selectedRows}
        isSubmitting={mutations.isMerging}
        onSubmit={(target) =>
          mutations.mergeAliases({ aliasIds: selectedRows.map((r) => r.id), target })
        }
      />
    </section>
  );
}

interface AliasesBodyProps {
  readonly data: UseAliasesData;
  readonly mutations: ReturnType<typeof useAliasMutations>;
}

function AliasesBody({ data, mutations }: AliasesBodyProps) {
  const { t } = useTranslation('food');
  if (data.isLoading)
    return <p className="text-muted-foreground text-sm">{t('data.aliases.status.loading')}</p>;
  if (data.isError)
    return <p className="text-destructive text-sm">{t('data.aliases.status.error')}</p>;
  if (data.rows.length === 0)
    return <p className="text-muted-foreground text-sm">{t('data.aliases.status.empty')}</p>;
  return (
    <AliasesTable
      rows={data.rows}
      sort={data.sort}
      onSortChange={data.setSort}
      selectedIds={data.selectedIds}
      onToggleSelection={data.toggleSelection}
      onSelectAll={data.selectAll}
      onClearSelection={data.clearSelection}
      onUpdateAlias={mutations.updateAliasText}
      onDeleteAlias={mutations.deleteAlias}
    />
  );
}
