/**
 * Wishlist page - savings goals
 */
import type { ColumnDef } from "@tanstack/react-table";
import { trpc } from "@/lib/trpc";
import { DataTable, SortableHeader } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import type { ColumnFilter } from "@/components/DataTableFilters";

interface WishlistItem {
  id: string;
  item: string;
  targetAmount: number | null;
  saved: number | null;
  remainingAmount: number | null;
  priority: string | null;
  url: string | null;
  notes: string | null;
  lastEditedTime: string;
}

export function WishlistPage() {
  const { data, isLoading, error, refetch } = trpc.wishlist.list.useQuery({
    limit: 100,
  });

  const columns: ColumnDef<WishlistItem>[] = [
    {
      accessorKey: "item",
      header: ({ column }) => (
        <SortableHeader column={column}>Item</SortableHeader>
      ),
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.item}</div>
          {row.original.url && (
            <a
              href={row.original.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              View link
            </a>
          )}
        </div>
      ),
    },
    {
      accessorKey: "priority",
      header: "Priority",
      cell: ({ row }) => {
        const priority = row.original.priority;
        if (!priority) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <Badge
            variant={
              priority === "Needing"
                ? "default"
                : priority === "Soon"
                  ? "secondary"
                  : "outline"
            }
            className="text-xs"
          >
            {priority}
          </Badge>
        );
      },
    },
    {
      accessorKey: "targetAmount",
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Target</SortableHeader>
        </div>
      ),
      cell: ({ row }) => {
        const amount = row.original.targetAmount;
        if (amount === null) {
          return <div className="text-right text-muted-foreground">—</div>;
        }
        return (
          <div className="text-right font-mono font-medium tabular-nums">
            ${amount.toFixed(2)}
          </div>
        );
      },
    },
    {
      accessorKey: "saved",
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Saved</SortableHeader>
        </div>
      ),
      cell: ({ row }) => {
        const amount = row.original.saved;
        if (amount === null) {
          return <div className="text-right text-muted-foreground">—</div>;
        }
        return (
          <div className="text-right font-mono font-medium tabular-nums text-green-600 dark:text-green-400">
            ${amount.toFixed(2)}
          </div>
        );
      },
    },
    {
      accessorKey: "remainingAmount",
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Remaining</SortableHeader>
        </div>
      ),
      cell: ({ row }) => {
        const amount = row.original.remainingAmount;
        if (amount === null) {
          return <div className="text-right text-muted-foreground">—</div>;
        }
        return (
          <div className="text-right font-mono font-medium tabular-nums">
            ${amount.toFixed(2)}
          </div>
        );
      },
    },
    {
      id: "progress",
      header: "Progress",
      cell: ({ row }) => {
        const { targetAmount, saved } = row.original;
        if (targetAmount === null || saved === null || targetAmount === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        const percentage = Math.min(
          100,
          Math.round((saved / targetAmount) * 100)
        );
        return (
          <div className="flex items-center gap-2 min-w-[120px]">
            <Progress value={percentage} className="h-2 flex-1" />
            <span className="text-xs font-medium tabular-nums w-10 text-right">
              {percentage}%
            </span>
          </div>
        );
      },
    },
  ];

  const tableFilters: ColumnFilter[] = [
    {
      id: "priority",
      type: "select",
      label: "Priority",
      options: [
        { label: "All Priorities", value: "" },
        { label: "Needing", value: "Needing" },
        { label: "Soon", value: "Soon" },
        { label: "One Day", value: "One Day" },
        { label: "Dreaming", value: "Dreaming" },
      ],
    },
  ];

  if (error) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold">Wish List</h1>
        <Alert variant="destructive">
          <p className="font-semibold">Failed to load wish list</p>
          <p className="text-sm">{error.message}</p>
          <button onClick={() => refetch()} className="mt-2 text-sm underline">
            Try again
          </button>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Wish List</h1>
          <p className="text-muted-foreground">
            {data && `${data.pagination.total} total items`}
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
          searchColumn="item"
          searchPlaceholder="Search wish list..."
          paginated
          defaultPageSize={50}
          pageSizeOptions={[25, 50, 100]}
          filters={tableFilters}
        />
      ) : null}
    </div>
  );
}
