import { useCallback } from 'react';

import { trpc } from '@pops/api-client';
import { useSetPageContext } from '@pops/navigation';
import { Alert, Button, DataTable, PageHeader, Skeleton } from '@pops/ui';

import { buildColumns, type Transaction } from './transactions/columns';
import { TABLE_FILTERS } from './transactions/filters';

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" />
      <Alert variant="destructive">
        <p className="font-semibold">Failed to load transactions</p>
        <p className="text-sm">{message}</p>
        <Button variant="link" size="sm" onClick={onRetry} className="mt-2 px-0">
          Try again
        </Button>
      </Alert>
    </div>
  );
}

function TableContent({
  isLoading,
  transactions,
  columns,
}: {
  isLoading: boolean;
  transactions: Transaction[] | undefined;
  columns: ReturnType<typeof buildColumns>;
}) {
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
      searchPlaceholder="Search transactions..."
      paginated
      defaultPageSize={50}
      pageSizeOptions={[25, 50, 100]}
      filters={TABLE_FILTERS}
    />
  );
}

function useTagHandlers() {
  const utils = trpc.useUtils();
  const updateMutation = trpc.finance.transactions.update.useMutation({
    onSuccess: () => void utils.finance.transactions.list.invalidate(),
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
      const result = await utils.finance.transactions.suggestTags.fetch({
        description,
        entityId: entityId ?? null,
      });
      return result.tags;
    },
    [utils]
  );
  return { onTagSave, onTagSuggest };
}

export function TransactionsPage() {
  useSetPageContext({ page: 'transactions' });
  const { data, isLoading, error, refetch } = trpc.finance.transactions.list.useQuery({
    limit: 100,
  });
  const { data: availableTags } = trpc.finance.transactions.availableTags.useQuery();
  const { onTagSave, onTagSuggest } = useTagHandlers();
  const columns = buildColumns({ availableTags: availableTags ?? [], onTagSave, onTagSuggest });

  if (error) return <ErrorView message={error.message} onRetry={() => refetch()} />;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description={data ? `${data.pagination.total} total transactions` : undefined}
      />
      <TableContent isLoading={isLoading} transactions={data?.data} columns={columns} />
    </div>
  );
}
