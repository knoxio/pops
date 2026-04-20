import { Plus } from 'lucide-react';

import { Alert, Button, DataTable, Skeleton } from '@pops/ui';

import { buildWishlistColumns, WISHLIST_TABLE_FILTERS } from './wishlist/columns';
import { DeleteWishlistDialog } from './wishlist/DeleteWishlistDialog';
import { useWishlistPage } from './wishlist/useWishlistPage';
import { WishlistFormDialog } from './wishlist/WishlistFormDialog';

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Wish List</h1>
      <Alert variant="destructive">
        <p className="font-semibold">Failed to load wish list</p>
        <p className="text-sm">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
          Try again
        </Button>
      </Alert>
    </div>
  );
}

function PageHeader({ totalText, onAdd }: { totalText: string; onAdd: () => void }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Wish List</h1>
        <p className="text-muted-foreground text-sm">{totalText}</p>
      </div>
      <Button onClick={onAdd}>
        <Plus className="mr-2 h-4 w-4" /> Add Item
      </Button>
    </div>
  );
}

export function WishlistPage() {
  const state = useWishlistPage();
  const { query } = state;

  if (query.error)
    return <ErrorPanel message={query.error.message} onRetry={() => query.refetch()} />;

  const columns = buildWishlistColumns({ onEdit: state.handleEdit, onDelete: state.setDeletingId });
  const totalText = query.data
    ? `${query.data.pagination.total} items to save for`
    : 'Tracking your goals';

  return (
    <div className="space-y-6">
      <PageHeader totalText={totalText} onAdd={state.handleAdd} />
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
          searchColumn="item"
          searchPlaceholder="Search items..."
          paginated
          defaultPageSize={50}
          filters={WISHLIST_TABLE_FILTERS}
        />
      )}
      <WishlistFormDialog
        open={state.isDialogOpen}
        onOpenChange={state.setIsDialogOpen}
        editingItem={state.editingItem}
        form={state.form}
        isSubmitting={state.isSubmitting}
        onSubmit={state.onSubmit}
      />
      <DeleteWishlistDialog
        deletingId={state.deletingId}
        setDeletingId={state.setDeletingId}
        isDeleting={state.deleteMutation.isPending}
        onConfirm={(id) => state.deleteMutation.mutate({ id })}
      />
    </div>
  );
}
