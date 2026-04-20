import { Button } from './Button';

import type { Table as TanStackTable } from '@tanstack/react-table';

export interface DataTablePaginationProps<TData> {
  table: TanStackTable<TData>;
  pageSizeOptions: number[];
  enableRowSelection: boolean;
}

export function DataTablePagination<TData>({
  table,
  pageSizeOptions,
  enableRowSelection,
}: DataTablePaginationProps<TData>) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground">
        {enableRowSelection && (
          <>
            {table.getFilteredSelectedRowModel().rows.length} of{' '}
            {table.getFilteredRowModel().rows.length} row(s) selected.
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        <PageSizeSelect table={table} pageSizeOptions={pageSizeOptions} />
        <PageNav table={table} />
      </div>
    </div>
  );
}

function PageSizeSelect<TData>({
  table,
  pageSizeOptions,
}: {
  table: TanStackTable<TData>;
  pageSizeOptions: number[];
}) {
  return (
    <div className="flex items-center gap-2">
      <p className="hidden text-sm font-medium sm:block">Rows per page</p>
      <select
        value={table.getState().pagination.pageSize}
        onChange={(e) => table.setPageSize(Number(e.target.value))}
        className="h-10 w-18 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {pageSizeOptions.map((pageSize) => (
          <option key={pageSize} value={pageSize}>
            {pageSize}
          </option>
        ))}
      </select>
    </div>
  );
}

function PageNav<TData>({ table }: { table: TanStackTable<TData> }) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-sm font-medium">
        Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
