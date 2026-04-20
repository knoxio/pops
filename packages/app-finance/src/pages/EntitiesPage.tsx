import { Plus } from 'lucide-react';

import { Alert, Button, DataTable, PageHeader, Skeleton } from '@pops/ui';

import { buildEntityColumns, ENTITY_TABLE_FILTERS } from './entities/columns';
import { DeleteEntityDialog } from './entities/DeleteEntityDialog';
import { EntityFormDialog } from './entities/EntityFormDialog';
import { useEntitiesPage } from './entities/useEntitiesPage';

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Entities" />
      <Alert variant="destructive">
        <p className="font-semibold">Failed to load entities</p>
        <p className="text-sm">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
          Try again
        </Button>
      </Alert>
    </div>
  );
}

function getDescription(
  data: { pagination: { total: number } } | undefined,
  showOrphanedOnly: boolean
): string {
  if (!data) return 'Manage merchants and payees';
  if (showOrphanedOnly) return `${data.pagination.total} orphaned entities`;
  return `${data.pagination.total} total entities`;
}

interface TableSectionProps {
  isLoading: boolean;
  data:
    | {
        data: ReturnType<typeof useEntitiesPage>['query']['data'] extends infer T
          ? T extends { data: infer U }
            ? U
            : never
          : never;
      }
    | undefined;
  showOrphanedOnly: boolean;
  setShowOrphanedOnly: React.Dispatch<React.SetStateAction<boolean>>;
  columns: ReturnType<typeof buildEntityColumns>;
}

function TableSection({
  isLoading,
  data,
  showOrphanedOnly,
  setShowOrphanedOnly,
  columns,
}: TableSectionProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant={showOrphanedOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowOrphanedOnly((prev) => !prev)}
        >
          {showOrphanedOnly ? 'Showing orphaned only' : 'Show orphaned only'}
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={(data?.data as never) ?? []}
        searchable
        searchColumn="name"
        searchPlaceholder="Search entities..."
        paginated
        defaultPageSize={50}
        pageSizeOptions={[25, 50, 100]}
        filters={ENTITY_TABLE_FILTERS}
      />
    </>
  );
}

export function EntitiesPage() {
  const state = useEntitiesPage();
  const { query } = state;

  if (query.error)
    return <ErrorPanel message={query.error.message} onRetry={() => query.refetch()} />;

  const columns = buildEntityColumns({ onEdit: state.handleEdit, onDelete: state.setDeletingId });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Entities"
        description={getDescription(query.data, state.showOrphanedOnly)}
        actions={
          <Button onClick={state.handleAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add Entity
          </Button>
        }
      />
      <TableSection
        isLoading={query.isLoading}
        data={query.data as never}
        showOrphanedOnly={state.showOrphanedOnly}
        setShowOrphanedOnly={state.setShowOrphanedOnly}
        columns={columns}
      />
      <EntityFormDialog
        open={state.isDialogOpen}
        onOpenChange={state.setIsDialogOpen}
        editingEntity={state.editingEntity}
        form={state.form}
        isSubmitting={state.isSubmitting}
        onSubmit={state.onSubmit}
      />
      <DeleteEntityDialog
        deletingId={state.deletingId}
        setDeletingId={state.setDeletingId}
        isDeleting={state.deleteMutation.isPending}
        onConfirm={(id) => state.deleteMutation.mutate({ id })}
      />
    </div>
  );
}
