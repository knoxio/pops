import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, Select, type SelectOption, TextInput } from '@pops/ui';

const getConditionOptions = (t: (k: string) => string): SelectOption[] => [
  { value: '', label: t('items.allConditions') },
  { value: 'new', label: t('items.conditionNew') },
  { value: 'good', label: t('items.conditionGood') },
  { value: 'fair', label: t('items.conditionFair') },
  { value: 'poor', label: t('items.conditionPoor') },
  { value: 'broken', label: t('items.conditionBroken') },
];

const getInUseOptions = (t: (k: string) => string): SelectOption[] => [
  { value: '', label: t('items.allInUse') },
  { value: 'true', label: t('items.inUse') },
  { value: 'false', label: t('items.notInUse') },
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
  const { t } = useTranslation('inventory');
  return (
    <TextInput
      placeholder={t('items.searchPlaceholder')}
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
  const { t } = useTranslation('inventory');
  const CONDITION_OPTIONS = getConditionOptions(t);
  const IN_USE_OPTIONS = getInUseOptions(t);
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
        placeholder={t('items.allTypes')}
        className="w-36"
      />
      <Select
        value={conditionFilter}
        onChange={(e) => onParamChange('condition', e.target.value)}
        options={CONDITION_OPTIONS}
        placeholder={t('items.allConditions')}
        className="w-40"
      />
      <Select
        value={inUseFilter}
        onChange={(e) => onParamChange('inUse', e.target.value)}
        options={IN_USE_OPTIONS}
        placeholder={t('items.allInUse')}
        className="w-28"
      />
      <Select
        value={locationFilter}
        onChange={(e) => onParamChange('locationId', e.target.value)}
        options={locationOptions}
        placeholder={t('locations.allLocations')}
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
