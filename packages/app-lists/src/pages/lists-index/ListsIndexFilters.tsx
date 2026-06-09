import { useTranslation } from 'react-i18next';

import { Badge, Button } from '@pops/ui';

import {
  DEFAULT_FILTERS,
  LIST_KINDS,
  SORT_OPTIONS,
  type ListKind,
  type ListsIndexFilterState,
  type SortOption,
} from './list-index-types.js';

function isDefaultKinds(kinds: readonly ListKind[]): boolean {
  return (
    kinds.length === DEFAULT_FILTERS.kinds.length && LIST_KINDS.every((k) => kinds.includes(k))
  );
}

import type { ReactElement } from 'react';

interface Props {
  value: ListsIndexFilterState;
  onChange: (next: ListsIndexFilterState) => void;
}

export function ListsIndexFilters({ value, onChange }: Props): ReactElement {
  const { t } = useTranslation('lists');
  return (
    <div className="space-y-3">
      <KindChips
        selected={value.kinds}
        onToggle={(kinds) => onChange({ ...value, kinds })}
        label={t('index.filters.kind')}
        kindLabel={(k) => t(`index.kinds.${k}`)}
      />
      <ToggleRow value={value} onChange={onChange} />
    </div>
  );
}

interface KindChipsProps {
  selected: ListKind[];
  onToggle: (next: ListKind[]) => void;
  label: string;
  kindLabel: (kind: ListKind) => string;
}

function KindChips({ selected, onToggle, label, kindLabel }: KindChipsProps): ReactElement {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs uppercase tracking-wide text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {LIST_KINDS.map((kind) => {
          const isOn = selected.includes(kind);
          return (
            <Badge
              key={kind}
              variant={isOn ? 'default' : 'outline'}
              asChild
              className="cursor-pointer select-none"
            >
              <button
                type="button"
                aria-pressed={isOn}
                onClick={() =>
                  onToggle(isOn ? selected.filter((k) => k !== kind) : [...selected, kind])
                }
              >
                {kindLabel(kind)}
              </button>
            </Badge>
          );
        })}
      </div>
    </fieldset>
  );
}

interface ToggleRowProps {
  value: ListsIndexFilterState;
  onChange: (next: ListsIndexFilterState) => void;
}

function ToggleRow({ value, onChange }: ToggleRowProps): ReactElement {
  const { t } = useTranslation('lists');
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.includeArchived}
          onChange={(e) => onChange({ ...value, includeArchived: e.target.checked })}
        />
        {t('index.filters.showArchived')}
      </label>
      <SortPicker
        value={value.sort}
        onChange={(sort) => onChange({ ...value, sort })}
        label={t('index.filters.sort')}
        optionLabel={(s) => t(`index.sort.${s}`)}
      />
      {hasActiveFilters(value) && (
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...DEFAULT_FILTERS })}>
          {t('index.filters.clear')}
        </Button>
      )}
    </div>
  );
}

interface SortPickerProps {
  value: SortOption;
  onChange: (next: SortOption) => void;
  label: string;
  optionLabel: (sort: SortOption) => string;
}

function SortPicker({ value, onChange, label, optionLabel }: SortPickerProps): ReactElement {
  return (
    <label className="flex items-center gap-2">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortOption)}
        className="rounded border bg-background px-2 py-1"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {optionLabel(opt)}
          </option>
        ))}
      </select>
    </label>
  );
}

function hasActiveFilters(s: ListsIndexFilterState): boolean {
  return !isDefaultKinds(s.kinds) || s.includeArchived || s.sort !== DEFAULT_FILTERS.sort;
}
