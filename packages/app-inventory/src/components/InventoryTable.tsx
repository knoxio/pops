import { Check, X } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';

/**
 * InventoryTable — sortable table for inventory items.
 *
 * Columns: Asset ID, Name, Brand, Type, Condition, Location, Value, In Use.
 * Click row navigates to detail page.
 *
 * The `locationPathMap` prop maps each `locationId` to its breadcrumb path
 * segments (root-first). Build this from the location tree in the parent page.
 */
import {
  AssetIdBadge,
  type Condition,
  ConditionBadge,
  DataTable,
  formatAUD,
  LocationBreadcrumb,
  type LocationSegment,
  SortableHeader,
  TypeBadge,
} from '@pops/ui';

import type { ColumnDef } from '@tanstack/react-table';

export interface InventoryTableItem {
  id: string;
  itemName: string;
  brand: string | null;
  type: string | null;
  condition: string | null;
  location: string | null;
  locationId: string | null;
  replacementValue: number | null;
  purchaseDate: string | null;
  inUse: boolean;
  assetId: string | null;
}

/** Known condition values (lowercase canonical + legacy Title Case). */
const VALID_CONDITIONS = new Set<string>([
  'new',
  'good',
  'fair',
  'poor',
  'broken',
  // Legacy Title Case values from seed data / Notion import
  'Excellent',
  'Good',
  'Fair',
  'Poor',
]);

function locationCell(
  locationPathMap: ReadonlyMap<string, LocationSegment[]>,
  row: { original: InventoryTableItem }
): React.ReactNode {
  const { locationId, location } = row.original;
  const segments = locationId ? locationPathMap.get(locationId) : undefined;
  if (segments && segments.length > 0) {
    return (
      <span title={segments.map((s) => s.name).join(' > ')}>
        <LocationBreadcrumb segments={segments} />
      </span>
    );
  }
  return <span className="text-muted-foreground">{location ?? '—'}</span>;
}

function conditionCell(condition: string | null): React.ReactNode {
  if (!condition || !VALID_CONDITIONS.has(condition)) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <ConditionBadge condition={condition as Condition} />;
}

function purchaseDateCell(date: string | null): React.ReactNode {
  if (!date) return <span className="text-muted-foreground">—</span>;
  return <span className="text-sm tabular-nums">{new Date(date).toLocaleDateString()}</span>;
}

function createColumns(
  locationPathMap: ReadonlyMap<string, LocationSegment[]>
): ColumnDef<InventoryTableItem>[] {
  return [
    {
      accessorKey: 'assetId',
      header: 'Asset ID',
      cell: ({ row }) =>
        row.original.assetId ? <AssetIdBadge assetId={row.original.assetId} /> : null,
    },
    {
      accessorKey: 'itemName',
      header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
      cell: ({ row }) => <span className="font-medium">{row.original.itemName}</span>,
    },
    {
      accessorKey: 'brand',
      header: ({ column }) => <SortableHeader column={column}>Brand</SortableHeader>,
      cell: ({ row }) => row.original.brand ?? '—',
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => (row.original.type ? <TypeBadge type={row.original.type} /> : null),
    },
    {
      accessorKey: 'condition',
      header: 'Condition',
      cell: ({ row }) => conditionCell(row.original.condition),
    },
    {
      accessorKey: 'location',
      header: ({ column }) => <SortableHeader column={column}>Location</SortableHeader>,
      cell: ({ row }) => locationCell(locationPathMap, row),
    },
    {
      accessorKey: 'replacementValue',
      header: ({ column }) => <SortableHeader column={column}>Value</SortableHeader>,
      cell: ({ row }) =>
        row.original.replacementValue != null ? formatAUD(row.original.replacementValue) : '—',
    },
    {
      accessorKey: 'purchaseDate',
      header: ({ column }) => <SortableHeader column={column}>Purchased</SortableHeader>,
      cell: ({ row }) => purchaseDateCell(row.original.purchaseDate),
    },
    {
      accessorKey: 'inUse',
      header: 'In Use',
      cell: ({ row }) =>
        row.original.inUse ? (
          <Check className="h-4 w-4 text-app-accent" />
        ) : (
          <X className="h-4 w-4 text-muted-foreground/40" />
        ),
    },
  ];
}

export interface InventoryTableProps {
  items: InventoryTableItem[];
  /**
   * Map from locationId → ordered breadcrumb segments (root-first).
   * Build this from the location tree in the parent page and pass it down so
   * the table does not need to fire per-row queries.
   */
  locationPathMap?: ReadonlyMap<string, LocationSegment[]>;
  loading?: boolean;
  /** Show the built-in search bar (default false — parent page handles search). */
  searchable?: boolean;
}

const EMPTY_LOCATION_MAP: ReadonlyMap<string, LocationSegment[]> = new Map();

export function InventoryTable({
  items,
  locationPathMap = EMPTY_LOCATION_MAP,
  loading,
  searchable = false,
}: InventoryTableProps) {
  const navigate = useNavigate();
  const columns = useMemo(() => createColumns(locationPathMap), [locationPathMap]);

  return (
    <DataTable
      columns={columns}
      data={items}
      loading={loading}
      searchable={searchable}
      searchColumn="itemName"
      searchPlaceholder="Search items..."
      paginated
      defaultPageSize={20}
      onRowClick={(row) => navigate(`/inventory/items/${row.id}`)}
      emptyState="No inventory items found."
    />
  );
}
