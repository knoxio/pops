/**
 * Failed-ingests tab body. `InboxPage` mounts it when `?tab=failed` is active.
 */
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FailedFilters, type FailedFiltersState } from './FailedFilters.js';
import { FailedRowCard } from './FailedRow.js';
import { DEFAULT_SINCE_DAYS, type FailedRow } from './inbox-types.js';
import { useFailedTab } from './useFailedTab.js';
import { ViewSourceDialog } from './ViewSourceDialog.js';

const DEFAULT_FILTERS: FailedFiltersState = {
  errorCodes: [],
  kinds: [],
  sinceDays: DEFAULT_SINCE_DAYS,
};

interface Props {
  initialFilters?: FailedFiltersState;
  now?: Date;
}

export function FailedTab({ initialFilters, now }: Props = {}): ReactElement {
  const { t } = useTranslation('food');
  const [filters, setFilters] = useState<FailedFiltersState>(initialFilters ?? DEFAULT_FILTERS);
  const [viewing, setViewing] = useState<FailedRow | null>(null);
  const { rows, availableErrorCodes, isLoading, isError, error, retry, retryingSourceId } =
    useFailedTab({ filters, t });
  return (
    <section className="space-y-4" data-testid="failed-tab">
      <FailedFilters
        value={filters}
        availableErrorCodes={availableErrorCodes}
        onChange={setFilters}
        onClear={() => setFilters(DEFAULT_FILTERS)}
        t={t}
      />
      {isLoading && <p className="text-sm text-muted-foreground">{t('inbox.failed.loading')}</p>}
      {isError && (
        <p className="text-sm text-destructive">
          {t('inbox.failed.error', { message: error?.message ?? '' })}
        </p>
      )}
      {!isLoading && !isError && rows.length === 0 && (
        <p className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
          {t('inbox.failed.empty')}
        </p>
      )}
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.sourceId}>
              <FailedRowCard
                row={row}
                onRetry={retry}
                onViewSource={setViewing}
                isRetrying={retryingSourceId === row.sourceId}
                now={now}
                t={t}
              />
            </li>
          ))}
        </ul>
      )}
      <ViewSourceDialog row={viewing} onClose={() => setViewing(null)} t={t} />
    </section>
  );
}
