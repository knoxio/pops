/**
 * Drafts tab body. `InboxPage` owns URL-hash sync so the URL stays the single
 * source of truth; this component receives the decoded filter state and an
 * `onFiltersChange` callback to push updates upward.
 */
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { DraftRow } from './DraftRow.js';
import { DEFAULT_DRAFTS_FILTERS, type DraftsFiltersState } from './drafts-filters.js';
import { DraftsFilters } from './DraftsFilters.js';
import { useDraftsTab } from './useDraftsTab.js';

interface Props {
  filters: DraftsFiltersState;
  onFiltersChange: (next: DraftsFiltersState) => void;
  /** Override "now" so tests can pin relative-time strings. */
  now?: Date;
}

export function DraftsTab({ filters, onFiltersChange, now }: Props): ReactElement {
  const { t } = useTranslation('food');
  const { rows, isLoading, isError, error } = useDraftsTab({ filters });
  const onClear = () => onFiltersChange(DEFAULT_DRAFTS_FILTERS);
  const filtersChanged = !filtersEqualDefault(filters);
  return (
    <section className="space-y-4" data-testid="drafts-tab">
      <DraftsFilters value={filters} onChange={onFiltersChange} onClear={onClear} t={t} />
      {isLoading && <p className="text-sm text-muted-foreground">{t('inbox.drafts.loading')}</p>}
      {isError && (
        <p className="text-sm text-destructive">
          {t('inbox.drafts.error', { message: error?.message ?? '' })}
        </p>
      )}
      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState filtersChanged={filtersChanged} onClear={onClear} t={t} />
      )}
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.versionId}>
              <DraftRow row={row} now={now} t={t} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function filtersEqualDefault(filters: DraftsFiltersState): boolean {
  return (
    filters.bands.length === DEFAULT_DRAFTS_FILTERS.bands.length &&
    filters.kinds.length === 0 &&
    filters.partialReasons.length === 0 &&
    !filters.freshOnly &&
    filters.sort === DEFAULT_DRAFTS_FILTERS.sort
  );
}

function EmptyState({
  filtersChanged,
  onClear,
  t,
}: {
  filtersChanged: boolean;
  onClear: () => void;
  t: (key: string) => string;
}): ReactElement {
  if (filtersChanged) {
    return (
      <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
        <p>{t('inbox.drafts.empty.filtered')}</p>
        <button
          type="button"
          onClick={onClear}
          className="mt-2 text-sm text-primary underline"
          data-testid="drafts-clear-filters"
        >
          {t('inbox.filters.clear')}
        </button>
      </div>
    );
  }
  return (
    <p className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
      {t('inbox.drafts.empty.none')}
    </p>
  );
}
