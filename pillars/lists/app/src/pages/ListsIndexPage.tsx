import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';

import { Button } from '@pops/ui';

import { DEFAULT_FILTERS, type ListsIndexFilterState } from './lists-index/list-index-types.js';
import { ListNewModal } from './lists-index/ListNewModal.js';
import { ListRow } from './lists-index/ListRow.js';
import { ListsIndexFilters } from './lists-index/ListsIndexFilters.js';
import { useListsIndexQuery, type ListIndexItemView } from './lists-index/useListsIndexQuery.js';

import type { ReactElement } from 'react';

/**
 * `/lists` — generic lists index (PRD-140 part B).
 *
 * Owns the local filter state; the query hook handles tRPC mechanics. The
 * "+ New list" button toggles `?new=1` on the URL, which `ListNewModal`
 * reads as its open/closed signal (deep-linkable + reload-safe).
 */
export function ListsIndexPage(): ReactElement {
  const { t } = useTranslation('lists');
  const [filters, setFilters] = useState<ListsIndexFilterState>(() => ({ ...DEFAULT_FILTERS }));
  const { items, isLoading, error, refetch } = useListsIndexQuery(filters);

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{t('index.title')}</h1>
          <p className="text-muted-foreground">{t('index.intro')}</p>
        </div>
        <NewListCta />
      </header>

      <ListsIndexFilters value={filters} onChange={setFilters} />

      {error !== null && <ErrorState message={error.message} retry={refetch} />}

      {error === null && <ListBody items={items} isLoading={isLoading} />}

      <ListNewModal />
    </div>
  );
}

function NewListCta(): ReactElement {
  const { t } = useTranslation('lists');
  const [params] = useSearchParams();
  // Preserve every other query param while toggling `new=1` so a filter
  // state encoded in the URL (future enhancement) survives the modal.
  const next = new URLSearchParams(params);
  next.set('new', '1');
  return (
    <Button asChild>
      <Link to={{ search: `?${next.toString()}` }}>{t('index.newCta')}</Link>
    </Button>
  );
}

interface ListBodyProps {
  items: ListIndexItemView[];
  isLoading: boolean;
}

function ListBody({ items, isLoading }: ListBodyProps): ReactElement {
  const { t } = useTranslation('lists');
  if (isLoading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('index.loading')}
      </p>
    );
  }
  if (items.length === 0) return <EmptyState />;
  return (
    <ul className="space-y-3" aria-label={t('index.resultsAriaLabel')}>
      {items.map((item) => (
        <li key={item.id}>
          <ListRow item={item} t={t} />
        </li>
      ))}
    </ul>
  );
}

function EmptyState(): ReactElement {
  const { t } = useTranslation('lists');
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set('new', '1');
  return (
    <div className="rounded-md border border-dashed p-10 text-center">
      <p className="mb-3 text-base font-medium">{t('index.empty.title')}</p>
      <p className="mb-4 text-sm text-muted-foreground">{t('index.empty.hint')}</p>
      <Button asChild>
        <Link to={{ search: `?${next.toString()}` }}>{t('index.empty.cta')}</Link>
      </Button>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  retry: () => void;
}

function ErrorState({ message, retry }: ErrorStateProps): ReactElement {
  const { t } = useTranslation('lists');
  return (
    <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
      <p className="mb-2 text-sm font-medium">{t('index.error.title')}</p>
      <p className="mb-3 text-xs text-muted-foreground">{message}</p>
      <Button size="sm" variant="outline" onClick={retry}>
        {t('index.error.retry')}
      </Button>
    </div>
  );
}
