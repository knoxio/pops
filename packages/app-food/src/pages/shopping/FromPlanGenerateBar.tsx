/**
 * Bottom bar of the FromPlanPage — list-name input + Cancel + Generate.
 */
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

interface FromPlanGenerateBarProps {
  listName: string;
  onChangeListName: (next: string) => void;
  onCancel: () => void;
  onGenerate: () => void;
  canGenerate: boolean;
  pending: boolean;
  errorMessage: string | null;
}

export function FromPlanGenerateBar({
  listName,
  onChangeListName,
  onCancel,
  onGenerate,
  canGenerate,
  pending,
  errorMessage,
}: FromPlanGenerateBarProps): ReactElement {
  const { t } = useTranslation('food');
  return (
    <section className="border-t pt-3 space-y-2" data-testid="from-plan-generate-bar">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium" htmlFor="from-plan-list-name">
          {t('shopping.fromPlan.listNameLabel')}
        </label>
        <input
          id="from-plan-list-name"
          type="text"
          className="border rounded px-2 py-1 text-sm flex-1 min-w-48"
          data-testid="from-plan-list-name"
          value={listName}
          onChange={(e) => onChangeListName(e.target.value)}
        />
      </div>
      {errorMessage === null ? null : (
        <div className="text-sm text-rose-600" role="alert" data-testid="generate-error">
          {errorMessage}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t('shopping.fromPlan.cancel')}
        </Button>
        <Button
          variant="default"
          onClick={onGenerate}
          disabled={!canGenerate || pending}
          data-testid="generate-list-btn"
        >
          {pending ? t('shopping.fromPlan.generating') : t('shopping.fromPlan.generate')}
        </Button>
      </div>
    </section>
  );
}
