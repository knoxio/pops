import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useSetPageContext } from '@pops/navigation';
import { Alert, Button, DataTable, PageHeader, Skeleton } from '@pops/ui';

import { BudgetFormDialog } from './budgets/BudgetFormDialog';
import { BUDGET_TABLE_FILTERS, buildBudgetColumns } from './budgets/columns';
import { DeleteBudgetDialog } from './budgets/DeleteBudgetDialog';
import { useBudgetsPage } from './budgets/useBudgetsPage';

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation('finance');
  return (
    <div className="space-y-6">
      <PageHeader title={t('budgets')} />
      <Alert variant="destructive">
        <p className="font-semibold">{t('budgets.failedToLoad')}</p>
        <p className="text-sm">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
          {t('common:tryAgain')}
        </Button>
      </Alert>
    </div>
  );
}

export function BudgetsPage() {
  const { t } = useTranslation('finance');
  useSetPageContext({ page: 'budgets' });
  const state = useBudgetsPage();
  const { query } = state;

  if (query.error)
    return <ErrorPanel message={query.error.message} onRetry={() => query.refetch()} />;

  const columns = buildBudgetColumns({ onEdit: state.handleEdit, onDelete: state.setDeletingId });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('budgets')}
        description={
          query.data
            ? t('budgets.totalCount', { count: query.data.pagination.total })
            : t('budgets.manageTargets')
        }
        actions={
          <Button onClick={state.handleAdd} prefix={<Plus className="h-4 w-4" />}>
            {t('budgets.addBudget')}
          </Button>
        }
      />
      {query.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          searchable
          searchColumn="category"
          searchPlaceholder={t('budgets.searchPlaceholder')}
          paginated
          defaultPageSize={50}
          filters={BUDGET_TABLE_FILTERS}
        />
      )}
      <BudgetFormDialog
        open={state.isDialogOpen}
        onOpenChange={state.setIsDialogOpen}
        editingBudget={state.editingBudget}
        form={state.form}
        isSubmitting={state.isSubmitting}
        onSubmit={state.onSubmit}
      />
      <DeleteBudgetDialog
        deletingId={state.deletingId}
        setDeletingId={state.setDeletingId}
        isDeleting={state.deleteMutation.isPending}
        onConfirm={(id) => state.deleteMutation.mutate({ id })}
      />
    </div>
  );
}
