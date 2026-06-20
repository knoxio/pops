import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Label, useDebouncedValue } from '@pops/ui';

import { unwrap } from '../../../food-api-helpers.js';
import { ingredientsGet, slugsSearch } from '../../../food-api/index.js';

import type { IngredientsGetResponses, SlugsSearchResponses } from '../../../food-api/types.gen.js';

type SlugSearchOutput = SlugsSearchResponses[200];
type IngredientsGetOutput = IngredientsGetResponses[200];

import { IngredientSearch, type SlugSearchItem } from './endpoint-picker/IngredientSearch';
import { KindToggle } from './endpoint-picker/KindToggle';
import { SelectedPill } from './endpoint-picker/SelectedPill';
import { VariantDropdown, type VariantOption } from './endpoint-picker/VariantDropdown';

import type { SubstitutionEndpointInput, SubstitutionEndpointKind } from './types';

interface Props {
  labelKey: string;
  value: SubstitutionEndpointInput | null;
  onChange: (next: SubstitutionEndpointInput | null) => void;
}

function useEndpointPickerQueries(
  value: SubstitutionEndpointInput | null,
  kind: SubstitutionEndpointKind,
  parentIngredientId: number | null,
  debounced: string
) {
  const searchEnabled = value === null && debounced.length > 0;
  const searchQuery = useQuery({
    queryKey: ['food', 'slugs', 'search', debounced],
    queryFn: async (): Promise<SlugSearchOutput> =>
      unwrap(await slugsSearch({ query: { query: debounced, kinds: ['ingredient'], limit: 8 } })),
    enabled: searchEnabled,
  });
  const matches = useMemo<readonly SlugSearchItem[]>(
    () => searchQuery.data?.items ?? [],
    [searchQuery.data]
  );
  const detailEnabled = kind === 'variant' && parentIngredientId !== null && value === null;
  const detailQuery = useQuery({
    queryKey: ['food', 'ingredients', 'get', parentIngredientId],
    queryFn: async (): Promise<IngredientsGetOutput> =>
      unwrap(await ingredientsGet({ path: { idOrSlug: String(parentIngredientId ?? 0) } })),
    enabled: detailEnabled,
  });
  const variants = useMemo<readonly VariantOption[]>(
    () =>
      (detailQuery.data?.variants ?? []).map((v) => ({
        id: v.id,
        slug: v.slug,
        name: v.name,
      })),
    [detailQuery.data]
  );
  return { matches, variants, isSearching: searchQuery.isLoading };
}

function PickerBody({
  inputId,
  variantSelectId,
  kind,
  query,
  setQuery,
  parentIngredientId,
  matches,
  variants,
  isSearching,
  onKindChange,
  onSlugPick,
  onVariantPick,
}: {
  inputId: string;
  variantSelectId: string;
  kind: SubstitutionEndpointKind;
  query: string;
  setQuery: (q: string) => void;
  parentIngredientId: number | null;
  matches: readonly SlugSearchItem[];
  variants: readonly VariantOption[];
  isSearching: boolean;
  onKindChange: (next: SubstitutionEndpointKind) => void;
  onSlugPick: (item: SlugSearchItem) => void;
  onVariantPick: (variantId: number) => void;
}) {
  return (
    <>
      <KindToggle kind={kind} onChange={onKindChange} />
      {parentIngredientId === null ? (
        <IngredientSearch
          inputId={inputId}
          query={query}
          setQuery={setQuery}
          matches={matches}
          onPick={onSlugPick}
          loading={isSearching}
        />
      ) : (
        <VariantDropdown variants={variants} selectId={variantSelectId} onPick={onVariantPick} />
      )}
    </>
  );
}

export function EndpointPicker({ labelKey, value, onChange }: Props) {
  const { t } = useTranslation('food');
  const inputId = useId();
  const variantSelectId = useId();
  const [kind, setKind] = useState<SubstitutionEndpointKind>('ingredient');
  const [query, setQuery] = useState('');
  const [parentIngredientId, setParentIngredientId] = useState<number | null>(null);
  const debounced = useDebouncedValue(query.trim(), 200);

  const { matches, variants, isSearching } = useEndpointPickerQueries(
    value,
    kind,
    parentIngredientId,
    debounced
  );

  function reset() {
    setQuery('');
    setParentIngredientId(null);
  }

  function handleSlugPick(item: SlugSearchItem) {
    if (kind === 'ingredient') {
      onChange({ kind: 'ingredient', id: item.targetId });
      setQuery('');
    } else {
      setParentIngredientId(item.targetId);
      setQuery('');
    }
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={inputId}>{t(labelKey)}</Label>
      {value !== null ? (
        <SelectedPill
          value={value}
          onClear={() => {
            onChange(null);
            reset();
          }}
        />
      ) : (
        <PickerBody
          inputId={inputId}
          variantSelectId={variantSelectId}
          kind={kind}
          query={query}
          setQuery={setQuery}
          parentIngredientId={parentIngredientId}
          matches={matches}
          variants={variants}
          isSearching={isSearching}
          onKindChange={(next) => {
            setKind(next);
            reset();
          }}
          onSlugPick={handleSlugPick}
          onVariantPick={(variantId) => onChange({ kind: 'variant', id: variantId })}
        />
      )}
    </div>
  );
}
