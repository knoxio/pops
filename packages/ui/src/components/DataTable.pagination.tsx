import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('ui');
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground">
        {enableRowSelection && (
          <>
            {t('dataTable.selectedRows', {
              selected: table.getFilteredSelectedRowModel().rows.length,
              total: table.getFilteredRowModel().rows.length,
            })}
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
  const { t } = useTranslation('ui');
  return (
    <div className="flex items-center gap-2">
      <p className="hidden text-sm font-medium sm:block">{t('dataTable.rowsPerPage')}</p>
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
  const { t } = useTranslation('ui');
  const pageCount = table.getPageCount();
  const current = pageCount === 0 ? 0 : table.getState().pagination.pageIndex + 1;
  return (
    <div className="flex items-center gap-2">
      <div className="text-sm font-medium">
        {t('dataTable.page', {
          current,
          total: pageCount,
        })}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          {t('dataTable.previous')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          {t('dataTable.next')}
        </Button>
      </div>
    </div>
  );
}
