/**
 * DataTableFilters - Filter components for DataTable
 * Supports text, select, multi-select, date range, and number range filters
 */
import { useState } from "react";
import type { Column, Row, Table } from "@tanstack/react-table";
import { X, SlidersHorizontal } from "lucide-react";
import { TextInput } from "./TextInput";
import { Select, type SelectOption } from "./Select";
import { Button } from "./Button";
import { NumberInput } from "./NumberInput";
import { ComboboxSelect } from "./ComboboxSelect";

export interface ColumnFilter {
  id: string;
  type: "text" | "select" | "multiselect" | "daterange" | "numberrange";
  label: string;
  options?: SelectOption[];
  placeholder?: string;
}

interface TextFilterProps {
  column: Column<unknown, unknown>;
  placeholder?: string;
}

export function TextFilter({ column, placeholder }: TextFilterProps) {
  return (
    <TextInput
      placeholder={placeholder || "Filter..."}
      value={(column.getFilterValue() as string) ?? ""}
      onChange={(e) => column.setFilterValue(e.target.value)}
      clearable
      onClear={() => column.setFilterValue("")}
      className="w-full sm:max-w-sm"
    />
  );
}

interface SelectFilterProps {
  column: Column<unknown, unknown>;
  options: SelectOption[];
  placeholder?: string;
}

export function SelectFilter({ column, options, placeholder }: SelectFilterProps) {
  return (
    <Select
      value={(column.getFilterValue() as string) ?? ""}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      options={options}
      placeholder={placeholder || "Select..."}
      className="w-45"
    />
  );
}

interface MultiSelectFilterProps {
  column: Column<unknown, unknown>;
  options: SelectOption[];
  placeholder?: string;
}

export function MultiSelectFilter({ column, options, placeholder }: MultiSelectFilterProps) {
  const filterValue = (column.getFilterValue() as string[]) ?? [];

  return (
    <ComboboxSelect
      options={options.map((opt) => ({ label: opt.label, value: opt.value }))}
      value={filterValue}
      onChange={(value) =>
        column.setFilterValue(Array.isArray(value) && value.length > 0 ? value : undefined)
      }
      multiple
      placeholder={placeholder || "Select..."}
      className="min-w-50"
    />
  );
}

interface DateRangeFilterProps {
  column: Column<unknown, unknown>;
}

export function DateRangeFilter({ column }: DateRangeFilterProps) {
  const filterValue = (column.getFilterValue() as [string, string]) ?? ["", ""];

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <TextInput
        type="date"
        value={filterValue[0]}
        onChange={(e) => column.setFilterValue([e.target.value, filterValue[1]])}
        placeholder="From"
        className="w-full sm:w-38"
      />
      <span className="hidden text-muted-foreground sm:block">to</span>
      <TextInput
        type="date"
        value={filterValue[1]}
        onChange={(e) => column.setFilterValue([filterValue[0], e.target.value])}
        placeholder="To"
        className="w-full sm:w-38"
      />
    </div>
  );
}

interface NumberRangeFilterProps {
  column: Column<unknown, unknown>;
  minPlaceholder?: string;
  maxPlaceholder?: string;
}

export function NumberRangeFilter({
  column,
  minPlaceholder = "Min",
  maxPlaceholder = "Max",
}: NumberRangeFilterProps) {
  const filterValue = (column.getFilterValue() as [number, number]) ?? [undefined, undefined];

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <NumberInput
        value={filterValue[0]}
        onChange={(value) => column.setFilterValue([value, filterValue[1]])}
        placeholder={minPlaceholder}
        className="w-full sm:w-25"
      />
      <span className="hidden text-muted-foreground sm:block">to</span>
      <NumberInput
        value={filterValue[1]}
        onChange={(value) => column.setFilterValue([filterValue[0], value])}
        placeholder={maxPlaceholder}
        className="w-full sm:w-25"
      />
    </div>
  );
}

interface FilterBarProps {
  filters: ColumnFilter[];
  table: Table<unknown>;
  onClearAll?: () => void;
}

export function FilterBar({ filters, table, onClearAll }: FilterBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeFiltersCount = table.getState().columnFilters.filter((f) => {
    const value = f.value;
    if (Array.isArray(value)) {
      return value.length > 0 && value.some((v) => v !== "" && v !== undefined);
    }
    return value !== "" && value !== undefined;
  }).length;

  const handleClearAll = () => {
    table.resetColumnFilters();
    onClearAll?.();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {/* Mobile: toggle button; Desktop: heading */}
        <Button
          variant="outline"
          size="default"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="md:hidden"
        >
          <SlidersHorizontal className="h-4 w-4 mr-2" />
          Filters
          {activeFiltersCount > 0 && (
            <span className="ml-1.5 rounded-full bg-primary text-primary-foreground text-xs px-1.5 py-0.5">
              {activeFiltersCount}
            </span>
          )}
        </Button>
        <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/80 hidden md:block">
          Filters
        </h3>
        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            size="default"
            onClick={handleClearAll}
            className="px-3 h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
            <X className="ml-2 h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div
        className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${mobileOpen ? "grid" : "hidden"} md:grid`}
      >
        {filters.map((filter) => {
          const column = table.getColumn(filter.id);
          if (!column) return null;

          return (
            <div key={filter.id} className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
                {filter.label}
              </label>
              {filter.type === "text" && (
                <TextFilter column={column} placeholder={filter.placeholder} />
              )}
              {filter.type === "select" && filter.options && (
                <SelectFilter
                  column={column}
                  options={filter.options}
                  placeholder={filter.placeholder}
                />
              )}
              {filter.type === "multiselect" && filter.options && (
                <MultiSelectFilter
                  column={column}
                  options={filter.options}
                  placeholder={filter.placeholder}
                />
              )}
              {filter.type === "daterange" && <DateRangeFilter column={column} />}
              {filter.type === "numberrange" && <NumberRangeFilter column={column} />}
            </div>
          );
        })}
      </div>
      {activeFiltersCount > 0 && (
        <div className="text-sm text-muted-foreground">
          {activeFiltersCount} filter{activeFiltersCount !== 1 ? "s" : ""} active
        </div>
      )}
    </div>
  );
}

// Custom filter functions for TanStack Table
export const dateRangeFilter = <TData,>(row: TData, columnId: string, filterValue: unknown) => {
  const [start, end] = filterValue as [string, string];
  const cellValue = (row as Row<unknown>).getValue(columnId) as string;

  if (!start && !end) return true;
  if (!cellValue) return false;

  const date = new Date(cellValue);
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;

  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;

  return true;
};

export const numberRangeFilter = <TData,>(row: TData, columnId: string, filterValue: unknown) => {
  const [min, max] = filterValue as [number, number];
  const cellValue = (row as Row<unknown>).getValue(columnId) as number;

  if (min === undefined && max === undefined) return true;
  if (cellValue === undefined || cellValue === null) return false;

  if (min !== undefined && cellValue < min) return false;
  if (max !== undefined && cellValue > max) return false;

  return true;
};

export const multiSelectFilter = <TData,>(row: TData, columnId: string, filterValue: unknown) => {
  const values = filterValue as string[];
  if (!values || values.length === 0) return true;
  const cellValue = (row as Row<unknown>).getValue(columnId);
  return values.includes(String(cellValue));
};
