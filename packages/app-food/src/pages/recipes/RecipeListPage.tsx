import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Button } from '@pops/ui';

import { DEFAULT_FILTERS, type RecipeListFilterState } from './recipe-list-types.js';
import { RecipeListCard } from './RecipeListCard.js';
import { RecipeListFilters } from './RecipeListFilters.js';
import { useDebounce } from './useDebounce.js';
import { useRecipeListQuery } from './useRecipeListQuery.js';

import type { ReactElement } from 'react';

const SEARCH_DEBOUNCE_MS = 200;

/**
 * `/food/recipes` — list page. Owns the local filter + cursor state;
 * the query hook handles tRPC + infinite-scroll mechanics.
 */
export function RecipeListPage(): ReactElement {
  const { t } = useTranslation('food');
  const [filters, setFilters] = useState<RecipeListFilterState>(() => ({ ...DEFAULT_FILTERS }));
  const debouncedSearch = useDebounce(filters.search, SEARCH_DEBOUNCE_MS);
  const { items, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, error, refetch } =
    useRecipeListQuery({ filters, debouncedSearch });

  const availableTags = useMemo(() => collectTags(items), [items]);

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{t('recipes.title')}</h1>
          <p className="text-muted-foreground">{t('recipes.list.intro')}</p>
        </div>
        <Button asChild>
          <Link to="/food/recipes/new">{t('recipes.list.newCta')}</Link>
        </Button>
      </header>

      <RecipeListFilters value={filters} onChange={setFilters} availableTags={availableTags} />

      {error !== null && <ErrorState message={error.message} retry={refetch} t={t} />}

      {error === null && (
        <ListBody
          items={items}
          isLoading={isLoading}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
          t={t}
        />
      )}
    </div>
  );
}

interface ListBodyProps {
  items: ReturnType<typeof useRecipeListQuery>['items'];
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function ListBody({
  items,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  t,
}: ListBodyProps): ReactElement {
  if (isLoading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('recipes.list.loading')}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-10 text-center">
        <p className="mb-3 text-base font-medium">{t('recipes.list.empty.title')}</p>
        <Button asChild>
          <Link to="/food/recipes/new">{t('recipes.list.empty.cta')}</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-3" aria-label={t('recipes.list.resultsAriaLabel')}>
        {items.map((item) => (
          <li key={item.slug}>
            <RecipeListCard item={item} t={t} />
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={fetchNextPage} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? t('recipes.list.loadingMore') : t('recipes.list.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  retry: () => void;
  t: (key: string) => string;
}

function ErrorState({ message, retry, t }: ErrorStateProps): ReactElement {
  return (
    <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
      <p className="mb-2 text-sm font-medium">{t('recipes.list.error.title')}</p>
      <p className="mb-3 text-xs text-muted-foreground">{message}</p>
      <Button size="sm" variant="outline" onClick={retry}>
        {t('recipes.list.error.retry')}
      </Button>
    </div>
  );
}

function collectTags(items: { tags: string[] }[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    for (const tag of item.tags) set.add(tag);
  }
  return [...set].toSorted();
}
