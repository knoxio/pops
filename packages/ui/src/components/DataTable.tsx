import { ArrowUpDown } from 'lucide-react';

import { cn } from '../lib/utils';
import { Button } from './Button';
import { DataTableBody } from './DataTable.body';
import { useDataTable } from './DataTable.hook';
import { DataTablePagination } from './DataTable.pagination';
import { DataTableToolbar } from './DataTable.toolbar';
import { type ColumnFilter, FilterBar } from './DataTableFilters';

/**
 * DataTable component - Comprehensive table with sorting, filtering, pagination, and editing
 * Built on TanStack Table and shadcn primitives
 */
import type { ColumnDef, Table as TanStackTable } from '@tanstack/react-table';

export interface DataTableProps<TData, TValue = unknown> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchable?: boolean;
  searchPlaceholder?: string;
  searchColumn?: string;
  paginated?: boolean;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  columnVisibility?: boolean;
  emptyState?: React.ReactNode;
  loading?: boolean;
  className?: string;
  onRowClick?: (row: TData) => void;
  enableRowSelection?: boolean;
  onSelectionChange?: (selectedRows: TData[]) => void;
  filters?: ColumnFilter[];
  filterFns?: Record<
    string,
    <TData>(row: TData, columnId: string, filterValue: unknown) => boolean
  >;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchable = false,
  searchPlaceholder = 'Search...',
  searchColumn,
  paginated = true,
  pageSizeOptions = [10, 20, 50, 100],
  defaultPageSize = 10,
  columnVisibility = true,
  emptyState,
  loading = false,
  className,
  onRowClick,
  enableRowSelection = false,
  onSelectionChange,
  filters,
  filterFns,
}: DataTableProps<TData, TValue>) {
  const table = useDataTable({
    data,
    columns,
    paginated,
    defaultPageSize,
    enableRowSelection,
    onSelectionChange,
    filterFns,
  });

  return (
    <div className={cn('space-y-4', className)}>
      {filters && filters.length > 0 && (
        <FilterBar filters={filters} table={table as unknown as TanStackTable<unknown>} />
      )}
      <DataTableToolbar
        table={table}
        searchable={searchable}
        searchPlaceholder={searchPlaceholder}
        searchColumn={searchColumn}
        columnVisibility={columnVisibility}
      />
      <DataTableBody
        table={table}
        loading={loading}
        columnCount={columns.length}
        emptyState={emptyState}
        onRowClick={onRowClick}
      />
      {paginated && (
        <DataTablePagination
          table={table}
          pageSizeOptions={pageSizeOptions}
          enableRowSelection={enableRowSelection}
        />
      )}
    </div>
  );
}

/**
 * Helper to create a sortable column header
 */
export function SortableHeader({
  column,
  children,
}: {
  column: {
    toggleSorting: (desc?: boolean) => void;
    getIsSorted: () => false | 'asc' | 'desc';
  };
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      className="-ml-3 h-8 text-2xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
    >
      {children}
      <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
    </Button>
  );
}
