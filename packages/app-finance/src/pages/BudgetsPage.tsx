/**
 * Budgets page - manage budgets
 */
import type { ColumnDef } from "@tanstack/react-table";
import { trpc } from "../lib/trpc";
import { DataTable, SortableHeader } from "@pops/ui";
import { Badge } from "@pops/ui";
import { Alert } from "@pops/ui";
import { Skeleton } from "@pops/ui";
import type { ColumnFilter } from "@pops/ui";

interface Budget {
  id: string;
  category: string;
  period: string | null;
  amount: number | null;
  active: boolean;
  notes: string | null;
  lastEditedTime: string;
}

export function BudgetsPage() {
  const { data, isLoading, error, refetch } = trpc.finance.budgets.list.useQuery({
    limit: 100,
  });

  const columns: ColumnDef<Budget>[] = [
    {
      accessorKey: "category",
      header: ({ column }) => <SortableHeader column={column}>Category</SortableHeader>,
      cell: ({ row }) => <div className="font-medium">{row.original.category}</div>,
    },
    {
      accessorKey: "period",
      header: "Period",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.period || <span className="text-muted-foreground">—</span>}
        </span>
      ),
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
        if (amount === null) {
          return <div className="text-right text-muted-foreground">—</div>;
        }
        return (
          <div className="text-right font-mono font-medium tabular-nums">${amount.toFixed(2)}</div>
        );
      },
    },
    {
      accessorKey: "active",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.active ? "default" : "secondary"} className="text-xs">
          {row.original.active ? "Active" : "Inactive"}
        </Badge>
      ),
      filterFn: (row, columnId, filterValue) => {
        if (filterValue === undefined || filterValue === null || filterValue === "") {
          return true;
        }
        const value = row.getValue<boolean>(columnId);
        const filterBool = filterValue === "true";
        return value === filterBool;
      },
    },
    {
      accessorKey: "notes",
      header: "Notes",
      cell: ({ row }) => {
        const notes = row.original.notes;
        if (!notes) {
          return <span className="text-muted-foreground">—</span>;
        }
        return <div className="max-w-md text-sm truncate text-muted-foreground">{notes}</div>;
      },
    },
  ];

  const tableFilters: ColumnFilter[] = [
    {
      id: "period",
      type: "select",
      label: "Period",
      options: [
        { label: "All Periods", value: "" },
        { label: "Monthly", value: "Monthly" },
        { label: "Yearly", value: "Yearly" },
      ],
    },
    {
      id: "active",
      type: "select",
      label: "Status",
      options: [
        { label: "All", value: "" },
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
  ];

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold">Budgets</h1>
        <Alert variant="destructive">
          <p className="font-semibold">Failed to load budgets</p>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Budgets</h1>
          <p className="text-muted-foreground">
            {data && `${data.pagination.total} total budgets`}
          </p>
        </div>
      </div>

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
          searchColumn="category"
          searchPlaceholder="Search budgets..."
          paginated
          defaultPageSize={50}
          pageSizeOptions={[25, 50, 100]}
          filters={tableFilters}
        />
      ) : null}
    </div>
  );
}
