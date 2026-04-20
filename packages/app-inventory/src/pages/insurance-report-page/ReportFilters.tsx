import { CheckboxInput, Label, Select } from '@pops/ui';

import { LocationPicker, type LocationTreeNode } from '../../components/LocationPicker';

type SortBy = 'value' | 'name' | 'type';

const SORT_OPTIONS = [
  { value: 'value', label: 'Value (high first)' },
  { value: 'name', label: 'Name' },
  { value: 'type', label: 'Type' },
];

interface ReportFiltersProps {
  locationId: string | undefined;
  includeChildren: boolean;
  sortBy: SortBy;
  locationTree: LocationTreeNode[];
  onLocationChange: (id: string | null) => void;
  onIncludeChildrenChange: (checked: boolean) => void;
  onSortByChange: (value: string) => void;
}

export function ReportFilters({
  locationId,
  includeChildren,
  sortBy,
  locationTree,
  onLocationChange,
  onIncludeChildrenChange,
  onSortByChange,
}: ReportFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-4 mb-6 print:hidden">
      <div className="w-64">
        <Label className="block mb-1">Filter by location</Label>
        <LocationPicker
          value={locationId ?? null}
          onChange={onLocationChange}
          locations={locationTree}
          placeholder="All locations"
        />
      </div>
      {locationId && (
        <CheckboxInput
          label="Include sub-locations"
          checked={includeChildren}
          onCheckedChange={onIncludeChildrenChange}
        />
      )}
      <Select
        label="Sort by"
        size="sm"
        value={sortBy}
        onChange={(e) => onSortByChange(e.target.value)}
        options={SORT_OPTIONS}
      />
    </div>
  );
}
