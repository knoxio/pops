/**
 * `/food/shopping/from-plan`.
 *
 * Pre-fills the date range from `?start=YYYY-MM-DD&end=YYYY-MM-DD` query
 * parameters when present (linked from the planning page's plan-header
 * button — see pillars/food/docs/prds/planning-page), otherwise defaults
 * to today + 6 days. Drives a server-side preview and gates a Generate
 * mutation that writes a new shopping list + navigates to `/lists/:id` on
 * success.
 */
import { useCallback, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';

import { defaultListName } from './default-list-name.js';
import { initialRangeFromParams, previewHasWritableItems } from './from-plan-helpers.js';
import { FromPlanGenerateBar } from './FromPlanGenerateBar.js';
import { FromPlanHeader } from './FromPlanHeader.js';
import { FromPlanPreview } from './FromPlanPreview.js';
import { validateRange } from './range-helpers.js';
import { useFromPlanEffects } from './use-from-plan-effects.js';
import { useGenerateAction } from './use-generate-action.js';
import { useFromPlanPage } from './useFromPlanPage.js';

import type { GeneratorPreview } from './types.js';

export function FromPlanPage(): ReactElement {
  const { t } = useTranslation('food');
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const initial = initialRangeFromParams(params.get('start'), params.get('end'));
  const [startDate, setStartDate] = useState<string>(initial.start);
  const [endDate, setEndDate] = useState<string>(initial.end);
  const [listName, setListName] = useState<string>(defaultListName(initial.start, initial.end));
  const [listNameDirty, setListNameDirty] = useState<boolean>(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const { previewQuery, generateMutation } = useFromPlanPage({ startDate, endDate });
  useFromPlanEffects({ startDate, endDate, setParams, listNameDirty, setListName });

  const onChangeListName = useCallback((next: string) => {
    setListName(next);
    setListNameDirty(true);
  }, []);

  const validation = validateRange(startDate, endDate);
  const preview = derivePreview(previewQuery);
  const canGenerate =
    validation.ok && listName.trim().length > 0 && previewHasWritableItems(preview);
  const previewError = derivePreviewError(validation.ok, previewQuery.error, t);
  const { onGenerate, onCancel } = useGenerateAction({
    startDate,
    endDate,
    listName,
    setGenerateError,
    navigate,
    t,
    generateMutation,
  });

  return (
    <main className="p-4 space-y-4 max-w-3xl" data-testid="from-plan-page">
      <h1 className="text-lg font-semibold">{t('shopping.fromPlan.title')}</h1>
      <FromPlanHeader
        startDate={startDate}
        endDate={endDate}
        planEntryCount={preview?.planEntryCount}
        onChangeStart={setStartDate}
        onChangeEnd={setEndDate}
      />
      <FromPlanPreview
        preview={preview}
        isLoading={previewQuery.status === 'pending' && validation.ok}
        errorMessage={previewError}
      />
      <FromPlanGenerateBar
        listName={listName}
        onChangeListName={onChangeListName}
        onCancel={onCancel}
        onGenerate={() => {
          void onGenerate();
        }}
        canGenerate={canGenerate}
        pending={generateMutation.isPending}
        errorMessage={generateError}
      />
    </main>
  );
}

type PreviewQuery = ReturnType<typeof useFromPlanPage>['previewQuery'];

function derivePreview(query: PreviewQuery): GeneratorPreview | undefined {
  if (query.status === 'pending') return undefined;
  if (query.status === 'error') return undefined;
  return query.data;
}

function derivePreviewError(
  rangeIsValid: boolean,
  queryError: PreviewQuery['error'],
  t: ReturnType<typeof useTranslation<'food'>>['t']
): string | null {
  if (!rangeIsValid) return null;
  if (queryError === null || queryError === undefined) return null;
  return t('shopping.fromPlan.error.BadDateRange');
}
