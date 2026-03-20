/**
 * Entities page - manage merchants/payees
 */
import type { ColumnDef } from "@tanstack/react-table";
import { trpc } from "@/lib/trpc";
import { DataTable, SortableHeader } from "@pops/ui";
import { Badge } from "@pops/ui";
import { Alert } from "@pops/ui";
import { Skeleton } from "@pops/ui";
import type { ColumnFilter } from "@pops/ui";

interface Entity {
  id: string;
  name: string;
  type: string | null;
  abn: string | null;
  aliases: string[];
  defaultTransactionType: string | null;
  defaultTags: string[];
  notes: string | null;
  lastEditedTime: string;
}

export function EntitiesPage() {
  const { data, isLoading, error, refetch } = trpc.entities.list.useQuery({
    limit: 100,
  });

  const columns: ColumnDef<Entity>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <SortableHeader column={column}>Name</SortableHeader>
      ),
      cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.original.type;
        if (!type) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <Badge variant="outline" className="text-xs">
            {type}
          </Badge>
        );
      },
    },
    {
      accessorKey: "abn",
      header: "ABN",
      cell: ({ row }) => (
        <span className="text-sm font-mono">
          {row.original.abn || <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      accessorKey: "aliases",
      header: "Aliases",
      cell: ({ row }) => {
        const aliases = row.original.aliases;
        if (!aliases || aliases.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {aliases.slice(0, 2).map((alias) => (
              <Badge key={alias} variant="secondary" className="text-xs">
                {alias}
              </Badge>
            ))}
            {aliases.length > 2 && (
              <Badge variant="secondary" className="text-xs">
                +{aliases.length - 2}
              </Badge>
            )}
          </div>
        );
      },
      filterFn: (row, columnId, filterValue) => {
        const searchTerm = String(filterValue ?? "")
          .toLowerCase()
          .trim();
        if (!searchTerm) {
          return true;
        }
        const aliases = row.getValue<string[]>(columnId);
        if (!aliases || aliases.length === 0) return false;
        return aliases.some((alias) =>
          alias.toLowerCase().includes(searchTerm)
        );
      },
    },
    {
      accessorKey: "defaultTransactionType",
      header: "Default Type",
      cell: ({ row }) => {
        const defaultType = row.original.defaultTransactionType;
        if (!defaultType) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <Badge variant="outline" className="text-xs">
            {defaultType}
          </Badge>
        );
      },
    },
    {
      accessorKey: "defaultTags",
      header: "Default Tags",
      cell: ({ row }) => {
        const tags = row.original.defaultTags;
        if (tags.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        );
      },
    },
  ];

  const tableFilters: ColumnFilter[] = [
    {
      id: "type",
      type: "select",
      label: "Type",
      options: [
        { label: "All Types", value: "" },
        { label: "Supermarket", value: "Supermarket" },
        { label: "Subscription", value: "Subscription" },
        { label: "Fuel Station", value: "Fuel Station" },
        { label: "Retailer", value: "Retailer" },
        { label: "Employer", value: "Employer" },
        { label: "Technology", value: "Technology" },
        { label: "Hardware", value: "Hardware" },
      ],
    },
  ];

  if (error) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold">Entities</h1>
        <Alert variant="destructive">
          <p className="font-semibold">Failed to load entities</p>
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
          <h1 className="text-3xl font-bold">Entities</h1>
          <p className="text-muted-foreground">
            {data && `${data.pagination.total} total entities`}
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
          searchColumn="name"
          searchPlaceholder="Search entities..."
          paginated
          defaultPageSize={50}
          pageSizeOptions={[25, 50, 100]}
          filters={tableFilters}
        />
      ) : null}
    </div>
  );
}
