import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Input } from '@pops/ui';

import {
  DEFAULT_FILTERS,
  RECIPE_TYPES,
  SORT_OPTIONS,
  type RecipeListFilterState,
  type RecipeType,
  type SortOrder,
} from './recipe-list-types.js';

import type { ReactElement } from 'react';

interface Props {
  value: RecipeListFilterState;
  onChange: (next: RecipeListFilterState) => void;
  /** Tags the user can choose from — for now the union of tags seen in the list. */
  availableTags: readonly string[];
}

/**
 * Search box + recipe-type chips + tag chips + archived/draft toggles + sort.
 * `onChange` fires on every keystroke / chip toggle / select change — the
 * parent page (`RecipeListPage`) debounces the resulting `search` field
 * before passing it to the query hook, so this component stays a thin
 * controlled-input shell.
 */
export function RecipeListFilters({ value, onChange, availableTags }: Props): ReactElement {
  const { t } = useTranslation('food');
  return (
    <div className="space-y-3">
      <SearchInput value={value.search} onChange={(s) => onChange({ ...value, search: s })} t={t} />
      <ChipGroup
        label={t('recipes.list.filters.recipeType')}
        options={RECIPE_TYPES.map((type) => ({
          key: type,
          label: t(`recipes.types.${type}`),
        }))}
        selected={value.recipeTypes}
        onToggle={(next) => onChange({ ...value, recipeTypes: next as RecipeType[] })}
      />
      {availableTags.length > 0 && (
        <ChipGroup
          label={t('recipes.list.filters.tags')}
          options={availableTags.map((tag) => ({ key: tag, label: tag }))}
          selected={value.tags}
          onToggle={(next) => onChange({ ...value, tags: next })}
        />
      )}
      <ToggleRow value={value} onChange={onChange} t={t} />
    </div>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (next: string) => void;
  t: (key: string) => string;
}

function SearchInput({ value, onChange, t }: SearchInputProps): ReactElement {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);
  return (
    <Input
      type="search"
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
        onChange(e.target.value);
      }}
      placeholder={t('recipes.list.searchPlaceholder')}
      aria-label={t('recipes.list.searchAriaLabel')}
    />
  );
}

interface ToggleRowProps {
  value: RecipeListFilterState;
  onChange: (next: RecipeListFilterState) => void;
  t: (key: string) => string;
}

function ToggleRow({ value, onChange, t }: ToggleRowProps): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.includeArchived}
          onChange={(e) => onChange({ ...value, includeArchived: e.target.checked })}
        />
        {t('recipes.list.filters.showArchived')}
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.includeDraftOnly}
          onChange={(e) => onChange({ ...value, includeDraftOnly: e.target.checked })}
        />
        {t('recipes.list.filters.showDraftOnly')}
      </label>
      <SortPicker value={value.sort} onChange={(sort) => onChange({ ...value, sort })} t={t} />
      {hasActiveFilters(value) && (
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...DEFAULT_FILTERS })}>
          {t('recipes.list.filters.clear')}
        </Button>
      )}
    </div>
  );
}

interface ChipGroupProps {
  label: string;
  options: { key: string; label: string }[];
  selected: string[];
  onToggle: (next: string[]) => void;
}

function ChipGroup({ label, options, selected, onToggle }: ChipGroupProps): ReactElement {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs uppercase tracking-wide text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isOn = selected.includes(opt.key);
          return (
            <Badge
              key={opt.key}
              variant={isOn ? 'default' : 'outline'}
              asChild
              className="cursor-pointer select-none"
            >
              <button
                type="button"
                aria-pressed={isOn}
                onClick={() =>
                  onToggle(isOn ? selected.filter((k) => k !== opt.key) : [...selected, opt.key])
                }
              >
                {opt.label}
              </button>
            </Badge>
          );
        })}
      </div>
    </fieldset>
  );
}

interface SortPickerProps {
  value: SortOrder;
  onChange: (next: SortOrder) => void;
  t: (key: string) => string;
}

function SortPicker({ value, onChange, t }: SortPickerProps): ReactElement {
  return (
    <label className="flex items-center gap-2">
      <span>{t('recipes.list.filters.sort')}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortOrder)}
        className="rounded border bg-background px-2 py-1"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {t(`recipes.list.sort.${opt}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

function hasActiveFilters(s: RecipeListFilterState): boolean {
  return (
    s.search.length > 0 ||
    s.recipeTypes.length > 0 ||
    s.tags.length > 0 ||
    s.includeArchived ||
    s.includeDraftOnly ||
    s.sort !== DEFAULT_FILTERS.sort
  );
}
