import { ComboboxSelect } from './ComboboxSelect';
import { NumberInput } from './NumberInput';
import { Select, type SelectOption } from './Select';
import { TextInput } from './TextInput';

import type { Column } from '@tanstack/react-table';

interface TextFilterProps {
  column: Column<unknown>;
  placeholder?: string;
  ariaLabel?: string;
}

export function TextFilter({ column, placeholder, ariaLabel }: TextFilterProps) {
  return (
    <TextInput
      placeholder={placeholder ?? 'Filter...'}
      value={(column.getFilterValue() as string) ?? ''}
      onChange={(e) => column.setFilterValue(e.target.value)}
      clearable
      onClear={() => column.setFilterValue('')}
      className="w-full"
      aria-label={ariaLabel}
    />
  );
}

interface SelectFilterProps {
  column: Column<unknown>;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
}

export function SelectFilter({ column, options, placeholder, ariaLabel }: SelectFilterProps) {
  return (
    <Select
      value={(column.getFilterValue() as string) ?? ''}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      options={options}
      placeholder={placeholder}
      className="w-full"
      aria-label={ariaLabel}
    />
  );
}

interface MultiSelectFilterProps {
  column: Column<unknown>;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
}

export function MultiSelectFilter({
  column,
  options,
  placeholder,
  ariaLabel,
}: MultiSelectFilterProps) {
  const filterValue = (column.getFilterValue() as string[]) ?? [];

  return (
    <ComboboxSelect
      options={options.map((opt) => ({ label: opt.label, value: opt.value }))}
      value={filterValue}
      onChange={(value) =>
        column.setFilterValue(Array.isArray(value) && value.length > 0 ? value : undefined)
      }
      multiple
      placeholder={placeholder ?? 'Select...'}
      className="w-full"
      aria-label={ariaLabel}
    />
  );
}

interface DateRangeFilterProps {
  column: Column<unknown>;
  ariaLabel?: string;
}

export function DateRangeFilter({ column, ariaLabel }: DateRangeFilterProps) {
  const filterValue = (column.getFilterValue() as [string, string]) ?? ['', ''];
  const fromLabel = ariaLabel ? `${ariaLabel} (from)` : 'From';
  const toLabel = ariaLabel ? `${ariaLabel} (to)` : 'To';

  return (
    <div className="flex min-w-0 flex-col gap-2 overflow-hidden sm:flex-row sm:items-center">
      <TextInput
        type="date"
        value={filterValue[0]}
        onChange={(e) => column.setFilterValue([e.target.value, filterValue[1]])}
        placeholder="From"
        className="min-w-0 flex-1"
        aria-label={fromLabel}
      />
      <span className="hidden text-muted-foreground sm:block">to</span>
      <TextInput
        type="date"
        value={filterValue[1]}
        onChange={(e) => column.setFilterValue([filterValue[0], e.target.value])}
        placeholder="To"
        className="min-w-0 flex-1"
        aria-label={toLabel}
      />
    </div>
  );
}

interface NumberRangeFilterProps {
  column: Column<unknown>;
  minPlaceholder?: string;
  maxPlaceholder?: string;
  ariaLabel?: string;
}

export function NumberRangeFilter({
  column,
  minPlaceholder = 'Min',
  maxPlaceholder = 'Max',
  ariaLabel,
}: NumberRangeFilterProps) {
  const filterValue = (column.getFilterValue() as [number, number]) ?? [undefined, undefined];
  const minLabel = ariaLabel ? `${ariaLabel} (min)` : minPlaceholder;
  const maxLabel = ariaLabel ? `${ariaLabel} (max)` : maxPlaceholder;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <NumberInput
        value={filterValue[0]}
        onChange={(value) => column.setFilterValue([value, filterValue[1]])}
        placeholder={minPlaceholder}
        className="w-full sm:w-25"
        aria-label={minLabel}
      />
      <span className="hidden text-muted-foreground sm:block">to</span>
      <NumberInput
        value={filterValue[1]}
        onChange={(value) => column.setFilterValue([filterValue[0], value])}
        placeholder={maxPlaceholder}
        className="w-full sm:w-25"
        aria-label={maxLabel}
      />
    </div>
  );
}
