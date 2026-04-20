import { ComboboxSelect } from './ComboboxSelect';
import { NumberInput } from './NumberInput';
import { Select, type SelectOption } from './Select';
import { TextInput } from './TextInput';

import type { Column } from '@tanstack/react-table';

interface TextFilterProps {
  column: Column<unknown>;
  placeholder?: string;
}

export function TextFilter({ column, placeholder }: TextFilterProps) {
  return (
    <TextInput
      placeholder={placeholder ?? 'Filter...'}
      value={(column.getFilterValue() as string) ?? ''}
      onChange={(e) => column.setFilterValue(e.target.value)}
      clearable
      onClear={() => column.setFilterValue('')}
      className="w-full sm:max-w-sm"
    />
  );
}

interface SelectFilterProps {
  column: Column<unknown>;
  options: SelectOption[];
  placeholder?: string;
}

export function SelectFilter({ column, options, placeholder }: SelectFilterProps) {
  return (
    <Select
      value={(column.getFilterValue() as string) ?? ''}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      options={options}
      placeholder={placeholder ?? 'Select...'}
      className="w-full sm:w-45"
    />
  );
}

interface MultiSelectFilterProps {
  column: Column<unknown>;
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
      placeholder={placeholder ?? 'Select...'}
      className="w-full sm:min-w-50"
    />
  );
}

interface DateRangeFilterProps {
  column: Column<unknown>;
}

export function DateRangeFilter({ column }: DateRangeFilterProps) {
  const filterValue = (column.getFilterValue() as [string, string]) ?? ['', ''];

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
  column: Column<unknown>;
  minPlaceholder?: string;
  maxPlaceholder?: string;
}

export function NumberRangeFilter({
  column,
  minPlaceholder = 'Min',
  maxPlaceholder = 'Max',
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
