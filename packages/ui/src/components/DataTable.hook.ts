import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';

import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';

export interface UseDataTableArgs<TData, TValue> {
  data: TData[];
  columns: ColumnDef<TData, TValue>[];
  paginated: boolean;
  defaultPageSize: number;
  enableRowSelection: boolean;
  onSelectionChange?: (rows: TData[]) => void;
  filterFns?: Record<
    string,
    <TData>(row: TData, columnId: string, filterValue: unknown) => boolean
  >;
}

export function useDataTable<TData, TValue>({
  data,
  columns,
  paginated,
  defaultPageSize,
  enableRowSelection,
  onSelectionChange,
  filterFns,
}: UseDataTableArgs<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibilityState, setColumnVisibilityState] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: paginated ? getPaginationRowModel() : undefined,
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibilityState,
    onRowSelectionChange: setRowSelection,
    state: { sorting, columnFilters, columnVisibility: columnVisibilityState, rowSelection },
    initialState: { pagination: { pageSize: defaultPageSize } },
    enableRowSelection,
    filterFns,
  });

  useMemo(() => {
    if (onSelectionChange && enableRowSelection) {
      const selectedRows = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
      onSelectionChange(selectedRows);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection, onSelectionChange, enableRowSelection, table]);

  return table;
}
