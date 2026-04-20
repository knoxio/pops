import { SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../primitives/dialog';
import { Button } from './Button';
import {
  DateRangeFilter,
  MultiSelectFilter,
  NumberRangeFilter,
  SelectFilter,
  TextFilter,
} from './DataTableFilters.fields';
import { type SelectOption } from './Select';

/**
 * DataTableFilters - Filter components for DataTable
 * Supports text, select, multi-select, date range, and number range filters
 */
import type { Table } from '@tanstack/react-table';

export interface ColumnFilter {
  id: string;
  type: 'text' | 'select' | 'multiselect' | 'daterange' | 'numberrange';
  label: string;
  options?: SelectOption[];
  placeholder?: string;
}

export {
  DateRangeFilter,
  MultiSelectFilter,
  NumberRangeFilter,
  SelectFilter,
  TextFilter,
} from './DataTableFilters.fields';
export { dateRangeFilter, multiSelectFilter, numberRangeFilter } from './DataTableFilters.fns';

interface FilterBarProps {
  filters: ColumnFilter[];
  table: Table<unknown>;
  onClearAll?: () => void;
}

function FilterGrid({ filters, table }: { filters: ColumnFilter[]; table: Table<unknown> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filters.map((filter) => {
        const column = table.getColumn(filter.id);
        if (!column) return null;
        return (
          <div key={filter.id} className="space-y-1.5">
            <label className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              {filter.label}
            </label>
            <FilterControl filter={filter} column={column} />
          </div>
        );
      })}
    </div>
  );
}

function FilterControl({
  filter,
  column,
}: {
  filter: ColumnFilter;
  column: NonNullable<ReturnType<Table<unknown>['getColumn']>>;
}) {
  if (filter.type === 'text')
    return <TextFilter column={column} placeholder={filter.placeholder} />;
  if (filter.type === 'select' && filter.options)
    return (
      <SelectFilter column={column} options={filter.options} placeholder={filter.placeholder} />
    );
  if (filter.type === 'multiselect' && filter.options)
    return (
      <MultiSelectFilter
        column={column}
        options={filter.options}
        placeholder={filter.placeholder}
      />
    );
  if (filter.type === 'daterange') return <DateRangeFilter column={column} />;
  if (filter.type === 'numberrange') return <NumberRangeFilter column={column} />;
  return null;
}

function countActiveFilters(table: Table<unknown>): number {
  return table.getState().columnFilters.filter((f) => {
    const value = f.value;
    if (Array.isArray(value)) return value.some((v) => v !== '' && v !== undefined);
    return value !== '' && value !== undefined;
  }).length;
}

function FilterBarHeader({
  activeFiltersCount,
  onOpenMobile,
  onClearAll,
}: {
  activeFiltersCount: number;
  onOpenMobile: () => void;
  onClearAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Button variant="outline" size="default" onClick={onOpenMobile} className="md:hidden">
        <SlidersHorizontal className="h-4 w-4 mr-2" />
        Filters
        {activeFiltersCount > 0 && (
          <span className="ml-1.5 rounded-full bg-primary text-primary-foreground text-xs px-1.5 py-0.5">
            {activeFiltersCount}
          </span>
        )}
      </Button>
      <h3 className="text-2xs font-bold uppercase tracking-widest text-muted-foreground/80 hidden md:block">
        Filters
      </h3>
      {activeFiltersCount > 0 && (
        <Button
          variant="ghost"
          size="default"
          onClick={onClearAll}
          className="px-3 h-8 text-xs text-muted-foreground hover:text-foreground"
        >
          Clear all
          <X className="ml-2 h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export function FilterBar({ filters, table, onClearAll }: FilterBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeFiltersCount = countActiveFilters(table);

  const handleClearAll = () => {
    table.resetColumnFilters();
    onClearAll?.();
  };

  return (
    <div className="space-y-4">
      <FilterBarHeader
        activeFiltersCount={activeFiltersCount}
        onOpenMobile={() => setMobileOpen(true)}
        onClearAll={handleClearAll}
      />
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="md:hidden max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
          </DialogHeader>
          <FilterGrid filters={filters} table={table} />
          <DialogFooter className="flex-row gap-2">
            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClearAll}>
                Clear all
              </Button>
            )}
            <Button size="sm" onClick={() => setMobileOpen(false)}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="hidden md:grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FilterGrid filters={filters} table={table} />
      </div>
      {activeFiltersCount > 0 && (
        <div className="text-sm text-muted-foreground">
          {activeFiltersCount} filter{activeFiltersCount !== 1 ? 's' : ''} active
        </div>
      )}
    </div>
  );
}
