import { ChevronDown, Search } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu';
import { Button } from './Button';
import { TextInput } from './TextInput';

import type { Table as TanStackTable } from '@tanstack/react-table';

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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          Columns <ChevronDown className="ml-2 h-4 w-4" />
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
              {column.id}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
