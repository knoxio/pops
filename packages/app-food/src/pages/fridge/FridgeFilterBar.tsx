/**
 * Header filter row for the FridgePage — PRD-147.
 *
 * Hosts the search box, location chips, expiring-soon / yielded-only
 * toggles, and the "show all" reveal for empty + soft-deleted batches.
 */
import { type ReactElement } from 'react';

import { Input } from '@pops/ui';

import type { BatchLocation } from '../../food-api-shared-types.js';
import type { FridgeFilterState } from './useFridgeView.js';

const LOCATION_LABELS: Record<BatchLocation, string> = {
  pantry: 'Pantry',
  fridge: 'Fridge',
  freezer: 'Freezer',
  other: 'Other',
};

interface FridgeFilterBarProps {
  filters: FridgeFilterState;
  onChange: (next: FridgeFilterState) => void;
  hiddenCount: number;
}

export function FridgeFilterBar({
  filters,
  onChange,
  hiddenCount,
}: FridgeFilterBarProps): ReactElement {
  const showAllAvailable = hiddenCount > 0 && !filters.showAll;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
      <Input
        type="search"
        value={filters.search}
        placeholder="Search by ingredient or variant"
        className="min-w-[200px] flex-1"
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
      />
      <LocationChips filters={filters} onChange={onChange} />
      <ChipToggle
        label="Expiring soon"
        active={filters.expiringSoon}
        onToggle={() => onChange({ ...filters, expiringSoon: !filters.expiringSoon })}
      />
      <ChipToggle
        label="Recipe-yielded"
        active={filters.recipeYieldedOnly}
        onToggle={() => onChange({ ...filters, recipeYieldedOnly: !filters.recipeYieldedOnly })}
      />
      {showAllAvailable && (
        <button
          type="button"
          className="text-xs underline"
          onClick={() => onChange({ ...filters, showAll: true })}
        >
          Show {hiddenCount} hidden
        </button>
      )}
      {filters.showAll && (
        <button
          type="button"
          className="text-xs underline"
          onClick={() => onChange({ ...filters, showAll: false })}
        >
          Hide empty + deleted
        </button>
      )}
    </div>
  );
}

interface LocationChipsProps {
  filters: FridgeFilterState;
  onChange: (next: FridgeFilterState) => void;
}

function LocationChips({ filters, onChange }: LocationChipsProps): ReactElement {
  function toggle(loc: BatchLocation): void {
    const next = filters.locations.includes(loc)
      ? filters.locations.filter((l) => l !== loc)
      : [...filters.locations, loc];
    onChange({ ...filters, locations: next });
  }
  return (
    <div className="flex flex-wrap gap-1">
      {(Object.keys(LOCATION_LABELS) as BatchLocation[]).map((loc) => (
        <ChipToggle
          key={loc}
          label={LOCATION_LABELS[loc]}
          active={filters.locations.includes(loc)}
          onToggle={() => toggle(loc)}
        />
      ))}
    </div>
  );
}

interface ChipToggleProps {
  label: string;
  active: boolean;
  onToggle: () => void;
}

function ChipToggle({ label, active, onToggle }: ChipToggleProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs ${
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
      }`}
    >
      {label}
    </button>
  );
}
