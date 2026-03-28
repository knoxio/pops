/**
 * Transactions page - list and manage transactions
 */
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback } from "react";
import { trpc } from "../lib/trpc";
import { DataTable, SortableHeader } from "@pops/ui";
import { Badge } from "@pops/ui";
import { Alert, PageHeader } from "@pops/ui";
import { Skeleton } from "@pops/ui";
import { TagEditor } from "../components/TagEditor";
import type { ColumnFilter } from "@pops/ui";

interface Transaction {
  id: string;
  description: string;
  account: string;
  amount: number;
  date: string;
  type: string;
  tags: string[];
  entityId: string | null;
  entityName: string | null;
  location: string | null;
}

export function TransactionsPage() {
  const utils = trpc.useUtils();

  // Fetch transactions using tRPC
  const { data, isLoading, error, refetch } = trpc.finance.transactions.list.useQuery({
    limit: 100,
  });

  const { data: availableTags } = trpc.finance.transactions.availableTags.useQuery();

  const updateMutation = trpc.finance.transactions.update.useMutation({
    onSuccess: () => {
      void utils.finance.transactions.list.invalidate();
    },
  });

  const handleTagSave = useCallback(
    (transactionId: string, _entityId: string | null, _description: string) =>
      async (tags: string[]) => {
        await updateMutation.mutateAsync({ id: transactionId, data: { tags } });
      },
    [updateMutation]
  );

  const handleTagSuggest = useCallback(
    (description: string, entityId: string | null) => async () => {
      const result = await utils.finance.transactions.suggestTags.fetch({
        description,
        entityId: entityId ?? null,
      });
      return result.tags;
    },
    [utils]
  );

  // Define table columns
  const columns: ColumnDef<Transaction>[] = [
    {
      accessorKey: "date",
      header: ({ column }) => <SortableHeader column={column}>Date</SortableHeader>,
      cell: ({ row }) => {
        const date = new Date(row.original.date);
        return date.toLocaleDateString("en-AU", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      },
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <div className="max-w-md">
          <div className="font-medium truncate">{row.original.description}</div>
          {row.original.entityName && (
            <div className="text-sm text-muted-foreground truncate">{row.original.entityName}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "account",
      header: "Account",
      cell: ({ row }) => <span className="text-sm font-mono">{row.original.account}</span>,
    },
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Amount</SortableHeader>
        </div>
      ),
      cell: ({ row }) => {
        const amount = row.original.amount;
        const isNegative = amount < 0;
        return (
          <div className="text-right font-mono font-medium tabular-nums">
            <span
              className={
                isNegative ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
              }
            >
              {isNegative ? "-" : "+"}${Math.abs(amount).toFixed(2)}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {row.original.type}
        </Badge>
      ),
    },
    {
      accessorKey: "tags",
      header: "Tags",
      cell: ({ row }) => {
        const { id, tags, entityId, description } = row.original;
        return (
          <TagEditor
            currentTags={tags}
            onSave={handleTagSave(id, entityId, description)}
            onSuggest={handleTagSuggest(description, entityId)}
            availableTags={availableTags ?? []}
          />
        );
      },
      filterFn: (row, columnId, filterValue) => {
        const searchTerm = String(filterValue ?? "")
          .toLowerCase()
          .trim();
        if (!searchTerm) return true;
        const tags = row.getValue<string[]>(columnId);
        if (!tags || tags.length === 0) return false;
        return tags.some((tag) => tag.toLowerCase().includes(searchTerm));
      },
    },
  ];

  // Define filters for the table
  const tableFilters: ColumnFilter[] = [
    {
      id: "account",
      type: "select",
      label: "Account",
      options: [
        { label: "All Accounts", value: "" },
        { label: "ANZ Everyday", value: "ANZ Everyday" },
        { label: "ANZ Savings", value: "ANZ Savings" },
        { label: "Amex", value: "Amex" },
        { label: "ING Savings", value: "ING Savings" },
        { label: "Up Everyday", value: "Up Everyday" },
      ],
    },
    {
      id: "type",
      type: "select",
      label: "Type",
      options: [
        { label: "All Types", value: "" },
        { label: "Income", value: "Income" },
        { label: "Expense", value: "Expense" },
        { label: "Transfer", value: "Transfer" },
      ],
    },
    {
      id: "tags",
      type: "text",
      label: "Tag",
      placeholder: "Filter by tag...",
    },
  ];

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Transactions" />
        <Alert variant="destructive">
          <p className="font-semibold">Failed to load transactions</p>
          <p className="text-sm">{error.message}</p>
          <button onClick={() => refetch()} className="mt-2 text-sm underline">
            Try again
          </button>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description={data ? `${data.pagination.total} total transactions` : undefined}
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : data ? (
        <DataTable
          columns={columns}
          data={data.data}
          searchable
          searchColumn="description"
          searchPlaceholder="Search transactions..."
          paginated
          defaultPageSize={50}
          pageSizeOptions={[25, 50, 100]}
          filters={tableFilters}
        />
      ) : null}
    </div>
  );
}
