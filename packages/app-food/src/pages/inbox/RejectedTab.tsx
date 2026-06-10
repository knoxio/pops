/**
 * PRD-138 — Rejected tab body.
 *
 * Self-contained component: mounts when PRD-134's tab shell selects the
 * `rejected` tab. Owns its own filter state internally; callers pass an
 * `initialFilters` prop (typically derived from a URL hash by PRD-134's
 * shell) so the URL→state plumbing belongs to whoever mounts this tab.
 */
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DEFAULT_SINCE_DAYS } from './inbox-types.js';
import { RejectedFilters, type RejectedFiltersState } from './RejectedFilters.js';
import { RejectedRowCard } from './RejectedRow.js';
import { useRejectedTab } from './useRejectedTab.js';

const DEFAULT_FILTERS: RejectedFiltersState = {
  reasons: [],
  kinds: [],
  sinceDays: DEFAULT_SINCE_DAYS,
};

interface Props {
  initialFilters?: RejectedFiltersState;
  /** Override "now" so tests can pin relative-time strings. */
  now?: Date;
}

export function RejectedTab({ initialFilters, now }: Props = {}): ReactElement {
  const { t } = useTranslation('food');
  const [filters, setFilters] = useState<RejectedFiltersState>(initialFilters ?? DEFAULT_FILTERS);
  const { rows, isLoading, isError, error, undo, undoingVersionId } = useRejectedTab({
    filters,
    t,
  });
  return (
    <section className="space-y-4" data-testid="rejected-tab">
      <RejectedFilters
        value={filters}
        onChange={setFilters}
        onClear={() => setFilters(DEFAULT_FILTERS)}
        t={t}
      />
      {isLoading && <p className="text-sm text-muted-foreground">{t('inbox.rejected.loading')}</p>}
      {isError && (
        <p className="text-sm text-destructive">
          {t('inbox.rejected.error', { message: error?.message ?? '' })}
        </p>
      )}
      {!isLoading && !isError && rows.length === 0 && (
        <p className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
          {t('inbox.rejected.empty')}
        </p>
      )}
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.versionId}>
              <RejectedRowCard
                row={row}
                onUndo={undo}
                isUndoing={undoingVersionId === row.versionId}
                now={now}
                t={t}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
