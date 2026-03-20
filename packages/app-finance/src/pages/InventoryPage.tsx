/**
 * Inventory page - home inventory management
 */
import type { ColumnDef } from "@tanstack/react-table";
import { trpc } from "../lib/trpc";
import { DataTable, SortableHeader } from "@pops/ui";
import { Badge } from "@pops/ui";
import { Alert } from "@pops/ui";
import { Skeleton } from "@pops/ui";
import type { ColumnFilter } from "@pops/ui";

interface InventoryItem {
  id: string;
  itemName: string;
  brand: string | null;
  model: string | null;
  itemId: string | null;
  room: string | null;
  location: string | null;
  type: string | null;
  condition: string | null;
  inUse: boolean;
  deductible: boolean;
  purchaseDate: string | null;
  warrantyExpires: string | null;
  replacementValue: number | null;
  resaleValue: number | null;
  purchaseTransactionId: string | null;
  purchasedFromId: string | null;
  purchasedFromName: string | null;
  lastEditedTime: string;
}

export function InventoryPage() {
  const { data, isLoading, error, refetch } = trpc.inventory.items.list.useQuery({
    limit: 100,
  });

  const columns: ColumnDef<InventoryItem>[] = [
    {
      accessorKey: "itemName",
      header: ({ column }) => (
        <SortableHeader column={column}>Item</SortableHeader>
      ),
      cell: ({ row }) => (
        <div className="py-1">
          <div className="font-semibold text-foreground leading-tight">
            {row.original.itemName}
          </div>
          {row.original.brand && (
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5 opacity-80">
              {row.original.brand}
              {row.original.model && (
                <>
                  <span className="mx-1 opacity-50">•</span>
                  {row.original.model}
                </>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "room",
      header: "Room",
      cell: ({ row }) => (
        <span className="text-xs font-medium text-foreground/90">
          {row.original.room || (
            <span className="text-muted-foreground/50">—</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "location",
      header: "Location",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.location || (
            <span className="text-muted-foreground/50">—</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.original.type;
        if (!type) {
          return <span className="text-muted-foreground/50">—</span>;
        }
        return (
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold py-0 px-1.5 h-5">
            {type}
          </Badge>
        );
      },
    },
    {
      accessorKey: "condition",
      header: "Condition",
      cell: ({ row }) => {
        const condition = row.original.condition;
        if (!condition) {
          return <span className="text-muted-foreground/50">—</span>;
        }
        return (
          <Badge
            variant={
              condition === "Excellent"
                ? "default"
                : condition === "Good"
                  ? "secondary"
                  : "outline"
            }
            className="text-[10px] uppercase tracking-wider font-semibold py-0 px-1.5 h-5"
          >
            {condition}
          </Badge>
        );
      },
    },
    {
      accessorKey: "replacementValue",
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>Value</SortableHeader>
        </div>
      ),
      cell: ({ row }) => {
        const value = row.original.replacementValue;
        if (value === null) {
          return <div className="text-right text-muted-foreground/50">—</div>;
        }
        return (
          <div className="text-right font-mono font-bold tabular-nums text-sm tracking-tight">
            ${value.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
          </div>
        );
      },
    },
    {
      accessorKey: "inUse",
      header: "In Use",
      cell: ({ row }) =>
        row.original.inUse ? (
          <Badge variant="default" className="text-[10px] uppercase tracking-wider font-bold py-0 px-1.5 h-5 bg-emerald-600 hover:bg-emerald-600">
            Yes
          </Badge>
        ) : null,
      filterFn: (row, columnId, filterValue) => {
        if (
          filterValue === undefined ||
          filterValue === null ||
          filterValue === ""
        ) {
          return true;
        }
        const value = row.getValue<boolean>(columnId);
        const filterBool = filterValue === "true";
        return value === filterBool;
      },
    },
    {
      accessorKey: "deductible",
      header: "Deductible",
      cell: ({ row }) =>
        row.original.deductible ? (
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-bold py-0 px-1.5 h-5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
            Yes
          </Badge>
        ) : null,
      filterFn: (row, columnId, filterValue) => {
        if (
          filterValue === undefined ||
          filterValue === null ||
          filterValue === ""
        ) {
          return true;
        }
        const value = row.getValue<boolean>(columnId);
        const filterBool = filterValue === "true";
        return value === filterBool;
      },
    },
  ];

  const tableFilters: ColumnFilter[] = [
    {
      id: "room",
      type: "select",
      label: "Room",
      options: [
        { label: "All Rooms", value: "" },
        { label: "Living Room", value: "Living Room" },
        { label: "Bedroom", value: "Bedroom" },
        { label: "Kitchen", value: "Kitchen" },
        { label: "Office", value: "Office" },
        { label: "Garage", value: "Garage" },
      ],
    },
    {
      id: "type",
      type: "select",
      label: "Type",
      options: [
        { label: "All Types", value: "" },
        { label: "Electronics", value: "Electronics" },
        { label: "Furniture", value: "Furniture" },
        { label: "Appliance", value: "Appliance" },
        { label: "Tool", value: "Tool" },
      ],
    },
    {
      id: "condition",
      type: "select",
      label: "Condition",
      options: [
        { label: "All Conditions", value: "" },
        { label: "Excellent", value: "Excellent" },
        { label: "Good", value: "Good" },
        { label: "Fair", value: "Fair" },
        { label: "Poor", value: "Poor" },
      ],
    },
    {
      id: "inUse",
      type: "select",
      label: "In Use",
      options: [
        { label: "All", value: "" },
        { label: "Yes", value: "true" },
        { label: "No", value: "false" },
      ],
    },
    {
      id: "deductible",
      type: "select",
      label: "Deductible",
      options: [
        { label: "All", value: "" },
        { label: "Yes", value: "true" },
        { label: "No", value: "false" },
      ],
    },
  ];

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold">Home Inventory</h1>
        <Alert variant="destructive">
          <p className="font-semibold">Failed to load inventory</p>
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
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Home Inventory</h1>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 mt-1">
            {data ? `${data.pagination.total} total items` : "Loading..."}
          </p>
        </div>
      </header>

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
          searchColumn="itemName"
          searchPlaceholder="Search inventory..."
          paginated
          defaultPageSize={50}
          pageSizeOptions={[25, 50, 100]}
          filters={tableFilters}
        />
      ) : null}
    </div>
  );
}
