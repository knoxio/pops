import { Search } from 'lucide-react';

import { Button, Select, type SelectOption, TextInput } from '@pops/ui';

const CONDITION_OPTIONS: SelectOption[] = [
  { value: '', label: 'All Conditions' },
  { value: 'new', label: 'New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
  { value: 'broken', label: 'Broken' },
];

const IN_USE_OPTIONS: SelectOption[] = [
  { value: '', label: 'All' },
  { value: 'true', label: 'In Use' },
  { value: 'false', label: 'Not In Use' },
];

interface FiltersBarProps {
  search: string;
  typeFilter: string;
  conditionFilter: string;
  inUseFilter: string;
  locationFilter: string;
  typeOptions: SelectOption[];
  locationOptions: SelectOption[];
  hasActiveFilters: boolean;
  onParamChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

function SearchField({
  search,
  onParamChange,
  onSearchKeyDown,
}: {
  search: string;
  onParamChange: (key: string, value: string) => void;
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <TextInput
      placeholder="Search items or asset IDs..."
      prefix={<Search className="h-4 w-4" />}
      value={search}
      onChange={(e) => onParamChange('q', e.target.value)}
      onKeyDown={onSearchKeyDown}
      clearable
      onClear={() => onParamChange('q', '')}
      className="w-full sm:max-w-xs"
    />
  );
}

export function FiltersBar({
  search,
  typeFilter,
  conditionFilter,
  inUseFilter,
  locationFilter,
  typeOptions,
  locationOptions,
  hasActiveFilters,
  onParamChange,
  onClearFilters,
  onSearchKeyDown,
}: FiltersBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <SearchField
        search={search}
        onParamChange={onParamChange}
        onSearchKeyDown={onSearchKeyDown}
      />
      <Select
        value={typeFilter}
        onChange={(e) => onParamChange('type', e.target.value)}
        options={typeOptions}
        className="w-36"
      />
      <Select
        value={conditionFilter}
        onChange={(e) => onParamChange('condition', e.target.value)}
        options={CONDITION_OPTIONS}
        className="w-40"
      />
      <Select
        value={inUseFilter}
        onChange={(e) => onParamChange('inUse', e.target.value)}
        options={IN_USE_OPTIONS}
        className="w-28"
      />
      <Select
        value={locationFilter}
        onChange={(e) => onParamChange('locationId', e.target.value)}
        options={locationOptions}
        className="w-40"
      />
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClearFilters}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
