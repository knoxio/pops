/**
 * `BatchOverridePicker` — two sticky-header sections inside one dropdown:
 *
 *   - **Same-variant**: batches whose `variantId` matches the line's
 *     variant, FIFO-ordered.
 *   - **Substitutions**: every valid sub edge for the line's variant ×
 *     its non-empty batches, ranked by the picker's pure ranking fn.
 *     Capped at 5 entries with a "Show all" expander.
 *
 * Selection routes through a discriminated `BatchPickerSelection` so the
 * shortfall row can wire same-variant vs sub picks into the right
 * resolution kind. Sub picks carry the `substitutionEdgeId` + ratio so
 * the shortfall row can compute the override's `consumeQty`.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { unwrap } from '../../food-api-helpers.js';
import { batchesSearchForConsume } from '../../food-api/index.js';
import { SameVariantSection } from './BatchOverridePicker.same-variant.js';
import { SubstitutionsSection } from './BatchOverridePicker.substitutions.js';
import { useSubstitutionResolution } from './useSubstitutionResolution.js';

import type { ReactNode } from 'react';

import type { BatchForConsumeRow } from './cook-resolution-types.js';
import type { SubCandidate, SubCandidateBatch } from './useSubstitutionResolution.js';

export type BatchPickerSelection =
  | { kind: 'same-variant'; batch: BatchForConsumeRow }
  | { kind: 'substitution'; candidate: SubCandidate; batch: SubCandidateBatch };

export interface BatchOverridePickerProps {
  ingredientId?: number;
  variantId?: number;
  recipeVersionId: number;
  lineIndex: number;
  linePrepStateId: number | null;
  onSelect: (selection: BatchPickerSelection) => void;
  onCancel: () => void;
}

function filterBatches(items: readonly BatchForConsumeRow[], search: string): BatchForConsumeRow[] {
  if (search === '') return [...items];
  const needle = search.toLowerCase();
  return items.filter((b) => {
    const haystack = `${b.ingredientName} ${b.variantName} ${b.prepStateLabel ?? ''}`;
    return haystack.toLowerCase().includes(needle);
  });
}

export function BatchOverridePicker(props: BatchOverridePickerProps): ReactNode {
  const {
    ingredientId,
    variantId,
    recipeVersionId,
    lineIndex,
    linePrepStateId,
    onSelect,
    onCancel,
  } = props;
  const { t } = useTranslation('food');
  const [search, setSearch] = useState('');

  const searchInput = { ingredientId, limit: 20 };
  const query = useQuery({
    queryKey: ['food', 'batches', 'searchForConsume', searchInput],
    queryFn: async () => unwrap(await batchesSearchForConsume({ body: searchInput })),
    enabled: ingredientId !== undefined,
  });

  const sameVariant = useMemo(() => {
    const items = query.data?.items ?? [];
    const scoped = variantId === undefined ? items : items.filter((b) => b.variantId === variantId);
    return filterBatches(scoped, search);
  }, [query.data, search, variantId]);

  const subs = useSubstitutionResolution({
    recipeVersionId,
    lineIndex,
    enabled: true,
  });

  return (
    <div className="border rounded-md p-3 bg-card space-y-2" data-testid="batch-override-picker">
      <header className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{t('cook.batchPicker.title')}</h4>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('cook.batchPicker.cancel')}
        </Button>
      </header>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('cook.batchPicker.search')}
        className="w-full border rounded px-2 py-1 text-sm"
        data-testid="batch-picker-search"
      />
      <SameVariantSection
        batches={sameVariant}
        onSelect={(batch) => onSelect({ kind: 'same-variant', batch })}
      />
      <SubstitutionsSection
        candidates={subs.rankedCandidates}
        linePrepStateId={linePrepStateId}
        isLoading={subs.isLoading}
        isError={subs.isError}
        onSelect={(selection) => onSelect({ kind: 'substitution', ...selection })}
      />
    </div>
  );
}
