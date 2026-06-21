import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSetPageContext } from '@pops/navigation';
import { Alert, Button, DataTable, PageHeader, Skeleton } from '@pops/ui';

import { unwrap } from '../finance-api-helpers.js';
import { transactionsSuggestTags, transactionsUpdate } from '../finance-api/index.js';
import { buildColumns, buildTransactionFilters, type Transaction } from './transactions/columns';
import { DeleteTransactionDialog } from './transactions/DeleteTransactionDialog';
import { TransactionFormDialog } from './transactions/TransactionFormDialog';
import { useTransactionsPage } from './transactions/useTransactionsPage';

import type { TFunction } from 'i18next';

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation('finance');
  return (
    <div className="space-y-6">
      <PageHeader title={t('transactions')} />
      <Alert variant="destructive">
        <p className="font-semibold">{t('transactions.failedToLoad')}</p>
        <p className="text-sm">{message}</p>
        <Button variant="link" size="sm" onClick={onRetry} className="mt-2 px-0">
          {t('common:tryAgain')}
        </Button>
      </Alert>
    </div>
  );
}

function TableContent({
  isLoading,
  transactions,
  columns,
  onFilteredCountChange,
}: {
  isLoading: boolean;
  transactions: Transaction[] | undefined;
  columns: ReturnType<typeof buildColumns>;
  onFilteredCountChange: (count: number) => void;
}) {
  const { t } = useTranslation('finance');
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!transactions) return null;
  return (
    <DataTable
      columns={columns}
      data={transactions}
      searchable
      searchColumn="description"
      searchPlaceholder={t('transactions.searchPlaceholder')}
      paginated
      defaultPageSize={50}
      filters={buildTransactionFilters(t)}
      onFilteredCountChange={onFilteredCountChange}
    />
  );
}

function buildSubtitle(
  t: TFunction<'finance'>,
  total: number,
  filteredCount: number | null
): string {
  if (filteredCount !== null && filteredCount < total) {
    return t('transactions.filteredCount', { filtered: filteredCount, total });
  }
  return t('transactions.totalCount', { count: total });
}

function useSubtitle(t: TFunction<'finance'>, total: number | undefined) {
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const description = total !== undefined ? buildSubtitle(t, total, filteredCount) : undefined;
  return { description, setFilteredCount };
}

interface UpdateInput {
  id: string;
  data: { tags: string[] };
}

function useTagHandlers() {
  const queryClient = useQueryClient();
  const updateMutation = useMutation({
    mutationFn: async (input: UpdateInput) =>
      unwrap(await transactionsUpdate({ path: { id: input.id }, body: input.data })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['finance', 'transactions'] }),
  });
  const onTagSave = useCallback(
    (transactionId: string, _entityId: string | null, _description: string) =>
      async (tags: string[]) => {
        await updateMutation.mutateAsync({ id: transactionId, data: { tags } });
      },
    [updateMutation]
  );
  const onTagSuggest = useCallback(
    (description: string, entityId: string | null) => async () => {
      try {
        const result = unwrap(
          await transactionsSuggestTags({
            query: { description, ...(entityId !== null && { entityId }) },
          })
        );
        return result.tags;
      } catch {
        return [];
      }
    },
    []
  );
  return { onTagSave, onTagSuggest };
}

export function TransactionsPage() {
  const { t } = useTranslation('finance');
  useSetPageContext({ page: 'transactions' });
  const state = useTransactionsPage();
  const { onTagSave, onTagSuggest } = useTagHandlers();
  const { description, setFilteredCount } = useSubtitle(t, state.query.data?.pagination.total); // prettier-ignore

  if (state.query.error) {
    return <ErrorView message={state.query.error.message} onRetry={() => state.query.refetch()} />;
  }

  const columns = buildColumns({
    t,
    availableTags: state.availableTags,
    onTagSave,
    onTagSuggest,
    onEdit: state.handleEdit,
    onDelete: state.setDeletingTx,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('transactions')}
        description={description}
        actions={
          <Button onClick={state.handleAdd} prefix={<Plus className="h-4 w-4" />}>
            {t('transactions.addTransaction')}
          </Button>
        }
      />
      <TableContent
        isLoading={state.query.isLoading}
        transactions={state.query.data?.data}
        columns={columns}
        onFilteredCountChange={setFilteredCount}
      />
      <TransactionFormDialog
        open={state.isDialogOpen}
        onOpenChange={state.setIsDialogOpen}
        editingTransaction={state.editingTransaction}
        form={state.form}
        isSubmitting={state.isSubmitting}
        onSubmit={state.onSubmit}
        entities={state.entities}
      />
      <DeleteTransactionDialog
        deletingTx={state.deletingTx}
        setDeletingTx={state.setDeletingTx}
        isDeleting={state.deleteMutation.isPending}
        onConfirm={(tx) => state.confirmDelete(tx)}
      />
    </div>
  );
}
