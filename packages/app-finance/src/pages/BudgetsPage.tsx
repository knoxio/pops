import { Plus } from 'lucide-react';

import { useSetPageContext } from '@pops/navigation';
import { Alert, Button, DataTable, PageHeader, Skeleton } from '@pops/ui';

import { BudgetFormDialog } from './budgets/BudgetFormDialog';
import { BUDGET_TABLE_FILTERS, buildBudgetColumns } from './budgets/columns';
import { DeleteBudgetDialog } from './budgets/DeleteBudgetDialog';
import { useBudgetsPage } from './budgets/useBudgetsPage';

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Budgets" />
      <Alert variant="destructive">
        <p className="font-semibold">Failed to load budgets</p>
        <p className="text-sm">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
          Try again
        </Button>
      </Alert>
    </div>
  );
}

export function BudgetsPage() {
  useSetPageContext({ page: 'budgets' });
  const state = useBudgetsPage();
  const { query } = state;

  if (query.error)
    return <ErrorPanel message={query.error.message} onRetry={() => query.refetch()} />;

  const columns = buildBudgetColumns({ onEdit: state.handleEdit, onDelete: state.setDeletingId });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budgets"
        description={
          query.data ? `${query.data.pagination.total} total budgets` : 'Manage spending targets'
        }
        actions={
          <Button onClick={state.handleAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add Budget
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
          searchPlaceholder="Search budgets..."
          paginated
          defaultPageSize={50}
          pageSizeOptions={[25, 50, 100]}
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
