import { ChevronDown, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu';
import { Button } from './Button';
import { TextInput } from './TextInput';

import type { Table as TanStackTable } from '@tanstack/react-table';

export function getColumnLabel(id: string, header: unknown): string {
  if (typeof header === 'string') return header;
  return id
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface DataTableToolbarProps<TData> {
  table: TanStackTable<TData>;
  searchable: boolean;
  searchPlaceholder: string;
  searchColumn?: string;
  columnVisibility: boolean;
}

export function DataTableToolbar<TData>({
  table,
  searchable,
  searchPlaceholder,
  searchColumn,
  columnVisibility,
}: DataTableToolbarProps<TData>) {
  if (!searchable && !columnVisibility) return null;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {searchable && searchColumn && (
        <TextInput
          placeholder={searchPlaceholder}
          prefix={<Search className="h-4 w-4" />}
          value={(table.getColumn(searchColumn)?.getFilterValue() as string) ?? ''}
          onChange={(e) => table.getColumn(searchColumn)?.setFilterValue(e.target.value)}
          className="w-full sm:max-w-sm"
          clearable
          onClear={() => table.getColumn(searchColumn)?.setFilterValue('')}
        />
      )}
      {columnVisibility && <ColumnVisibilityMenu table={table} />}
    </div>
  );
}

function ColumnVisibilityMenu<TData>({ table }: { table: TanStackTable<TData> }) {
  const { t } = useTranslation('ui');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {t('dataTable.columns')} <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {table
          .getAllColumns()
          .filter((column) => column.getCanHide())
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
            >
              {getColumnLabel(column.id, column.columnDef.header)}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
