import { useTranslation } from 'react-i18next';

import { Button, Label, TextInput } from '@pops/ui';

import { EndpointPicker } from './EndpointPicker';

import type { SubstitutionScope } from '../../../food-api-shared-types.js';
import type { SubstitutionEndpointInput, SubstitutionsFilterState } from './types';

interface Props {
  filters: SubstitutionsFilterState;
  onChange: (next: SubstitutionsFilterState) => void;
  onReset: () => void;
}

function endpointFromFilters(
  ingredientId: number | null,
  variantId: number | null
): SubstitutionEndpointInput | null {
  if (ingredientId !== null) return { kind: 'ingredient', id: ingredientId };
  if (variantId !== null) return { kind: 'variant', id: variantId };
  return null;
}

function FiltersHeader({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation('food');
  return (
    <div className="flex items-center justify-between">
      <h2 id="sub-filters-heading" className="text-sm font-semibold uppercase tracking-wide">
        {t('data.substitutions.filters.heading')}
      </h2>
      <Button variant="outline" size="sm" type="button" onClick={onReset}>
        {t('data.substitutions.filters.reset')}
      </Button>
    </div>
  );
}

function ScopeFilter({
  scope,
  onChange,
}: {
  scope: SubstitutionScope | null;
  onChange: (next: SubstitutionScope | null) => void;
}) {
  const { t } = useTranslation('food');
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="sub-filter-scope">{t('data.substitutions.filters.scope')}</Label>
      <select
        id="sub-filter-scope"
        value={scope ?? ''}
        onChange={(e) =>
          onChange(e.target.value === '' ? null : (e.target.value as SubstitutionScope))
        }
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
      >
        <option value="">{t('data.substitutions.filters.scopeAny')}</option>
        <option value="global">{t('data.substitutions.scope.global')}</option>
        <option value="recipe">{t('data.substitutions.scope.recipe')}</option>
      </select>
    </div>
  );
}

function RecipeIdFilter({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const { t } = useTranslation('food');
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="sub-filter-recipe">{t('data.substitutions.filters.recipeId')}</Label>
      <TextInput
        id="sub-filter-recipe"
        value={value === null ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw.length === 0) {
            onChange(null);
            return;
          }
          const num = Number(raw);
          onChange(Number.isFinite(num) ? num : null);
        }}
        inputMode="numeric"
      />
    </div>
  );
}

function ContextTagFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation('food');
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="sub-filter-tag">{t('data.substitutions.filters.contextTag')}</Label>
      <TextInput
        id="sub-filter-tag"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('data.substitutions.filters.contextTagHint')}
      />
    </div>
  );
}

export function SubstitutionsFilters({ filters, onChange, onReset }: Props) {
  const fromValue = endpointFromFilters(filters.fromIngredientId, filters.fromVariantId);
  const toValue = endpointFromFilters(filters.toIngredientId, filters.toVariantId);

  function handleFromChange(next: SubstitutionEndpointInput | null) {
    onChange({
      ...filters,
      fromIngredientId: next?.kind === 'ingredient' ? next.id : null,
      fromVariantId: next?.kind === 'variant' ? next.id : null,
    });
  }

  function handleToChange(next: SubstitutionEndpointInput | null) {
    onChange({
      ...filters,
      toIngredientId: next?.kind === 'ingredient' ? next.id : null,
      toVariantId: next?.kind === 'variant' ? next.id : null,
    });
  }

  return (
    <section
      aria-labelledby="sub-filters-heading"
      className="border-border space-y-3 rounded-md border p-4"
    >
      <FiltersHeader onReset={onReset} />
      <div className="grid gap-3 md:grid-cols-2">
        <EndpointPicker
          labelKey="data.substitutions.filters.from"
          value={fromValue}
          onChange={handleFromChange}
        />
        <EndpointPicker
          labelKey="data.substitutions.filters.to"
          value={toValue}
          onChange={handleToChange}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <ScopeFilter
          scope={filters.scope}
          onChange={(scope) =>
            onChange({ ...filters, scope, recipeId: scope === 'recipe' ? filters.recipeId : null })
          }
        />
        {filters.scope === 'recipe' ? (
          <RecipeIdFilter
            value={filters.recipeId}
            onChange={(recipeId) => onChange({ ...filters, recipeId })}
          />
        ) : null}
        <ContextTagFilter
          value={filters.contextTag}
          onChange={(contextTag) => onChange({ ...filters, contextTag })}
        />
      </div>
    </section>
  );
}
