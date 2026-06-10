/**
 * Header filter bar for `/food/solve` — PRD-150.
 *
 * Four controls: a "No substitutions" toggle, multi-select recipe-type
 * chips, multi-select tag chips, and a max-time dropdown. Every filter
 * is optional; clearing them all is the equivalent of unfiltered.
 *
 * Tag suggestions come from `food.recipes.distinctTags` if/when that
 * surface lands — for v1 the input takes a comma-separated string the
 * user types directly. Keeps the page shippable without a dependency
 * on a tag taxonomy that doesn't exist yet.
 */
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import type { ReactElement } from 'react';

import type { SolveFilterState } from './useSolveResult.js';

const RECIPE_TYPES = [
  'plate',
  'component',
  'sauce',
  'dressing',
  'drink',
  'condiment',
  'technique',
] as const;

const MAX_TIME_CHOICES = [15, 30, 45, 60] as const;

interface SolveFiltersProps {
  filters: SolveFilterState;
  onChange: (next: SolveFilterState) => void;
}

export function SolveFilters({ filters, onChange }: SolveFiltersProps): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <NoSubsToggle filters={filters} onChange={onChange} />
      <RecipeTypeChips filters={filters} onChange={onChange} />
      <TagsInput filters={filters} onChange={onChange} />
      <MaxTimeSelect filters={filters} onChange={onChange} />
    </div>
  );
}

function NoSubsToggle({ filters, onChange }: SolveFiltersProps): ReactElement {
  const { t } = useTranslation('food');
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={filters.excludeSubs}
        onChange={(e) => onChange({ ...filters, excludeSubs: e.target.checked })}
      />
      {t('solve.filters.noSubstitutions')}
    </label>
  );
}

function RecipeTypeChips({ filters, onChange }: SolveFiltersProps): ReactElement {
  const { t } = useTranslation('food');
  function toggle(type: (typeof RECIPE_TYPES)[number]): void {
    const next = new Set(filters.recipeTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onChange({ ...filters, recipeTypes: [...next] });
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {RECIPE_TYPES.map((type) => {
        const active = filters.recipeTypes.includes(type);
        return (
          <Button
            key={type}
            variant={active ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggle(type)}
          >
            {t(`solve.filters.recipeType.${type}`)}
          </Button>
        );
      })}
    </div>
  );
}

function TagsInput({ filters, onChange }: SolveFiltersProps): ReactElement {
  const { t } = useTranslation('food');
  function commit(raw: string): void {
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const part of raw.split(',')) {
      const tag = part.trim();
      if (tag.length === 0) continue;
      if (seen.has(tag)) continue;
      seen.add(tag);
      tags.push(tag);
    }
    onChange({ ...filters, tags });
  }
  // The `key` forces React to remount the uncontrolled input whenever
  // the canonical filter value changes (e.g. via "Clear filters") so a
  // stale `defaultValue` can't shadow the reset state.
  const value = filters.tags.join(', ');
  return (
    <label className="flex items-center gap-2 text-sm">
      <span>{t('solve.filters.tags')}</span>
      <input
        key={value}
        type="text"
        placeholder={t('solve.filters.tagsPlaceholder')}
        defaultValue={value}
        onBlur={(e) => commit(e.target.value)}
        className="rounded border px-2 py-1 text-sm"
      />
    </label>
  );
}

function MaxTimeSelect({ filters, onChange }: SolveFiltersProps): ReactElement {
  const { t } = useTranslation('food');
  return (
    <label className="flex items-center gap-2 text-sm">
      <span>{t('solve.filters.maxTime')}</span>
      <select
        value={filters.maxMinutes ?? ''}
        onChange={(e) =>
          onChange({
            ...filters,
            maxMinutes: e.target.value === '' ? null : Number(e.target.value),
          })
        }
        className="rounded border px-2 py-1 text-sm"
      >
        <option value="">{t('solve.filters.maxTimeAny')}</option>
        {MAX_TIME_CHOICES.map((mins) => (
          <option key={mins} value={mins}>
            {t('solve.filters.maxTimeOption', { minutes: mins })}
          </option>
        ))}
      </select>
    </label>
  );
}
