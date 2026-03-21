/**
 * InventoryTable — sortable table for inventory items.
 *
 * Columns: Asset ID, Name, Brand, Type, Condition, Location, Value, In Use.
 * Click row navigates to detail page.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, X } from "lucide-react";
import {
  DataTable,
  SortableHeader,
  AssetIdBadge,
  ConditionBadge,
  TypeBadge,
  type Condition,
} from "@pops/ui";

export interface InventoryTableItem {
  id: string;
  itemName: string;
  brand: string | null;
  type: string | null;
  condition: string | null;
  location: string | null;
  replacementValue: number | null;
  inUse: boolean;
  assetId: string | null;
}

const VALID_CONDITIONS = new Set<string>(["Excellent", "Good", "Fair", "Poor"]);

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function createColumns(): ColumnDef<InventoryTableItem>[] {
  return [
    {
      accessorKey: "assetId",
      header: "Asset ID",
      cell: ({ row }) => {
        const assetId = row.original.assetId;
        return assetId ? <AssetIdBadge assetId={assetId} /> : null;
      },
    },
    {
      accessorKey: "itemName",
      header: ({ column }) => (
        <SortableHeader column={column}>Name</SortableHeader>
      ),
      cell: ({ row }) => (
        <span className="font-medium">{row.original.itemName}</span>
      ),
    },
    {
      accessorKey: "brand",
      header: ({ column }) => (
        <SortableHeader column={column}>Brand</SortableHeader>
      ),
      cell: ({ row }) => row.original.brand ?? "—",
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.original.type;
        return type ? <TypeBadge type={type} /> : null;
      },
    },
    {
      accessorKey: "condition",
      header: "Condition",
      cell: ({ row }) => {
        const condition = row.original.condition;
        if (!condition || !VALID_CONDITIONS.has(condition))
          return condition ?? "—";
        return <ConditionBadge condition={condition as Condition} />;
      },
    },
    {
      accessorKey: "location",
      header: ({ column }) => (
        <SortableHeader column={column}>Location</SortableHeader>
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.location ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "replacementValue",
      header: ({ column }) => (
        <SortableHeader column={column}>Value</SortableHeader>
      ),
      cell: ({ row }) => {
        const value = row.original.replacementValue;
        return value != null ? formatCurrency(value) : "—";
      },
    },
    {
      accessorKey: "inUse",
      header: "In Use",
      cell: ({ row }) =>
        row.original.inUse ? (
          <Check className="h-4 w-4 text-emerald-600" />
        ) : (
          <X className="h-4 w-4 text-muted-foreground/40" />
        ),
    },
  ];
}

export interface InventoryTableProps {
  items: InventoryTableItem[];
  loading?: boolean;
}

export function InventoryTable({ items, loading }: InventoryTableProps) {
  const navigate = useNavigate();
  const columns = useMemo(() => createColumns(), []);

  return (
    <DataTable
      columns={columns}
      data={items}
      loading={loading}
      searchable
      searchColumn="itemName"
      searchPlaceholder="Search items..."
      paginated
      defaultPageSize={20}
      onRowClick={(row) => navigate(`/inventory/${row.id}`)}
      emptyState="No inventory items found."
    />
  );
}
