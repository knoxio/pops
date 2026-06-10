/**
 * Date-range picker header for the FromPlanPage — PRD-152.
 *
 * Two date inputs + a "↺ This week" button that snaps to the current ISO
 * Mon–Sun. Live plan-entry count caption. Disabled feedback messaging when
 * the range is invalid.
 */
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { isoMondayFor, isoSundayFor, validateRange } from './range-helpers.js';

interface FromPlanHeaderProps {
  startDate: string;
  endDate: string;
  planEntryCount: number | undefined;
  onChangeStart: (next: string) => void;
  onChangeEnd: (next: string) => void;
}

export function FromPlanHeader(props: FromPlanHeaderProps): ReactElement {
  const validation = validateRange(props.startDate, props.endDate);
  const snapThisWeek = (): void => {
    props.onChangeStart(isoMondayFor(new Date()));
    props.onChangeEnd(isoSundayFor(new Date()));
  };
  return (
    <section className="space-y-2" data-testid="from-plan-header">
      <Inputs
        startDate={props.startDate}
        endDate={props.endDate}
        onChangeStart={props.onChangeStart}
        onChangeEnd={props.onChangeEnd}
        onSnapThisWeek={snapThisWeek}
      />
      <Caption validation={validation} planEntryCount={props.planEntryCount} />
    </section>
  );
}

interface InputsProps {
  startDate: string;
  endDate: string;
  onChangeStart: (next: string) => void;
  onChangeEnd: (next: string) => void;
  onSnapThisWeek: () => void;
}

function Inputs({
  startDate,
  endDate,
  onChangeStart,
  onChangeEnd,
  onSnapThisWeek,
}: InputsProps): ReactElement {
  const { t } = useTranslation('food');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm font-medium" htmlFor="from-plan-start">
        {t('shopping.fromPlan.startLabel')}
      </label>
      <input
        id="from-plan-start"
        type="date"
        className="border rounded px-2 py-1 text-sm"
        data-testid="from-plan-start"
        value={startDate}
        onChange={(e) => {
          if (e.target.value !== '') onChangeStart(e.target.value);
        }}
      />
      <label className="text-sm font-medium" htmlFor="from-plan-end">
        {t('shopping.fromPlan.endLabel')}
      </label>
      <input
        id="from-plan-end"
        type="date"
        className="border rounded px-2 py-1 text-sm"
        data-testid="from-plan-end"
        value={endDate}
        onChange={(e) => {
          if (e.target.value !== '') onChangeEnd(e.target.value);
        }}
      />
      <Button variant="outline" size="sm" onClick={onSnapThisWeek} data-testid="snap-this-week">
        {t('shopping.fromPlan.thisWeekBtn')}
      </Button>
    </div>
  );
}

interface CaptionProps {
  validation: ReturnType<typeof validateRange>;
  planEntryCount: number | undefined;
}

function Caption({ validation, planEntryCount }: CaptionProps): ReactElement {
  const { t } = useTranslation('food');
  if (!validation.ok) {
    return (
      <div className="text-sm text-rose-600" role="alert" data-testid="range-error">
        {validation.reason === 'EndBeforeStart'
          ? t('shopping.fromPlan.endBeforeStart')
          : t('shopping.fromPlan.rangeTooLong')}
      </div>
    );
  }
  return (
    <div className="text-sm text-muted-foreground" data-testid="plan-count-caption">
      {planEntryCount === undefined
        ? '…'
        : t('shopping.fromPlan.planCountCaption', { count: planEntryCount })}
    </div>
  );
}
