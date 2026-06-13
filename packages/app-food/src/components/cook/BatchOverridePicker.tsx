/**
 * `BatchOverridePicker` — PRD-146 + PRD-149 (sections amendment).
 *
 * Two sticky-header sections inside one dropdown:
 *
 *   - **Same-variant** (PRD-146): batches whose `variantId` matches the
 *     line's variant, FIFO-ordered.
 *   - **Substitutions** (PRD-149): every valid sub edge for the line's
 *     variant × its non-empty batches, ranked by the picker's pure
 *     ranking fn. Capped at 5 entries with a "Show all" expander.
 *
 * Selection routes through a discriminated `BatchPickerSelection` so the
 * shortfall row can wire same-variant vs sub picks into the right
 * resolution kind. Sub picks carry the `substitutionEdgeId` + ratio so
 * the shortfall row can compute the override's `consumeQty`.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePillarQuery } from '@pops/pillar-sdk/react';
import { Button } from '@pops/ui';

import { SameVariantSection } from './BatchOverridePicker.same-variant.js';
import { SubstitutionsSection } from './BatchOverridePicker.substitutions.js';
import { useSubstitutionResolution } from './useSubstitutionResolution.js';

import type { inferRouterOutputs } from '@trpc/server';
import type { ReactNode } from 'react';

import type { AppRouter } from '@pops/api';
import type { BatchForConsumeRow } from '@pops/app-food-db';

import type { SubCandidate, SubCandidateBatch } from './useSubstitutionResolution.js';

type BatchesSearchForConsumeOutput =
  inferRouterOutputs<AppRouter>['food']['batches']['searchForConsume'];

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

  const query = usePillarQuery<BatchesSearchForConsumeOutput>(
    'food',
    ['batches', 'searchForConsume'],
    { ingredientId, limit: 20 },
    { enabled: ingredientId !== undefined }
  );

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
