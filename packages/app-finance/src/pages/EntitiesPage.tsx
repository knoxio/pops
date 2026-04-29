import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Alert, Button, DataTable, PageHeader, Skeleton } from '@pops/ui';

import { buildEntityColumns, ENTITY_TABLE_FILTERS } from './entities/columns';
import { DeleteEntityDialog } from './entities/DeleteEntityDialog';
import { EntityFormDialog } from './entities/EntityFormDialog';
import { useEntitiesPage } from './entities/useEntitiesPage';

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation('finance');
  return (
    <div className="space-y-6">
      <PageHeader title={t('entities')} />
      <Alert variant="destructive">
        <p className="font-semibold">{t('entities.failedToLoad')}</p>
        <p className="text-sm">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
          {t('common:tryAgain')}
        </Button>
      </Alert>
    </div>
  );
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
  const { t } = useTranslation('finance');
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
          {showOrphanedOnly ? t('entities.showingOrphanedOnly') : t('entities.showOrphanedOnly')}
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={(data?.data as never) ?? []}
        searchable
        searchColumn="name"
        searchPlaceholder={t('entities.searchPlaceholder')}
        paginated
        defaultPageSize={50}
        pageSizeOptions={[25, 50, 100]}
        filters={ENTITY_TABLE_FILTERS}
      />
    </>
  );
}

function getDescription(
  t: (key: string, opts?: Record<string, unknown>) => string,
  data: { pagination: { total: number } } | undefined,
  showOrphanedOnly: boolean
): string {
  if (!data) return t('entities.manageMerchants');
  if (showOrphanedOnly) return t('entities.orphanedCount', { count: data.pagination.total });
  return t('entities.totalCount', { count: data.pagination.total });
}

export function EntitiesPage() {
  const { t } = useTranslation('finance');
  const state = useEntitiesPage();
  const { query } = state;

  if (query.error)
    return <ErrorPanel message={query.error.message} onRetry={() => query.refetch()} />;

  const columns = buildEntityColumns({ onEdit: state.handleEdit, onDelete: state.setDeletingId });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('entities')}
        description={getDescription(t, query.data, state.showOrphanedOnly)}
        actions={
          <Button onClick={state.handleAdd} prefix={<Plus className="h-4 w-4" />}>
            {t('entities.addEntity')}
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
