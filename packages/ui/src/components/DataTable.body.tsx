import { flexRender } from '@tanstack/react-table';

import { cn } from '../lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/table';

import type { Table as TanStackTable } from '@tanstack/react-table';

export interface DataTableBodyProps<TData> {
  table: TanStackTable<TData>;
  loading: boolean;
  columnCount: number;
  emptyState?: React.ReactNode;
  onRowClick?: (row: TData) => void;
}

export function DataTableBody<TData>({
  table,
  loading,
  columnCount,
  emptyState,
  onRowClick,
}: DataTableBodyProps<TData>) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          <DataTableRows
            table={table}
            loading={loading}
            columnCount={columnCount}
            emptyState={emptyState}
            onRowClick={onRowClick}
          />
        </TableBody>
      </Table>
    </div>
  );
}

function DataTableRows<TData>({
  table,
  loading,
  columnCount,
  emptyState,
  onRowClick,
}: DataTableBodyProps<TData>) {
  if (loading) {
    return (
      <TableRow>
        <TableCell colSpan={columnCount} className="h-24 text-center">
          Loading...
        </TableCell>
      </TableRow>
    );
  }
  const rows = table.getRowModel().rows;
  if (rows?.length) {
    return (
      <>
        {rows.map((row) => (
          <TableRow
            key={row.id}
            data-state={row.getIsSelected() && 'selected'}
            onClick={() => onRowClick?.(row.original)}
            className={cn(onRowClick && 'cursor-pointer')}
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </>
    );
  }
  return (
    <TableRow>
      <TableCell colSpan={columnCount} className="h-24 text-center">
        {emptyState ?? 'No results.'}
      </TableCell>
    </TableRow>
  );
}
