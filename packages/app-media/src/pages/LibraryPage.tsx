import { Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useSetPageContext } from '@pops/navigation';
import { Button } from '@pops/ui';

import { DebriefBanner } from '../components/DebriefBanner';
import { DownloadQueue } from '../components/DownloadQueue';
import { LeavingSoonShelf } from '../components/LeavingSoonShelf';
import { useMediaLibrary } from '../hooks/useMediaLibrary';
import { LibraryContent } from './library/LibraryContent';
import { LibraryFilters } from './library/LibraryFilters';
import { LibraryHeader } from './library/LibraryHeader';
import { useLibraryParams } from './library/useLibraryParams';

function useLibraryFiltersContext({
  typeFilter,
  sortBy,
  searchQuery,
  genreFilter,
}: {
  typeFilter: string;
  sortBy: string;
  searchQuery: string;
  genreFilter: string | null;
}) {
  const libraryFilters = useMemo(() => {
    const f: Record<string, string> = {};
    if (typeFilter !== 'all') f.type = typeFilter;
    if (sortBy !== 'title') f.sort = sortBy;
    if (searchQuery) f.search = searchQuery;
    if (genreFilter) f.genre = genreFilter;
    return f;
  }, [typeFilter, sortBy, searchQuery, genreFilter]);
  useSetPageContext({ page: 'library', pageType: 'top-level', filters: libraryFilters });
}

function QuickPickFab() {
  const { t } = useTranslation('media');
  return (
    <Link
      to="/media/quick-pick"
      className="fixed bottom-6 right-6 z-50"
      aria-label={t('quickPick.title')}
    >
      <Button className="h-14 w-14 rounded-full bg-app-accent hover:bg-app-accent/90 shadow-lg shadow-app-accent/25 p-0">
        <Sparkles className="h-6 w-6" />
      </Button>
    </Link>
  );
}

export function LibraryPage() {
  const params = useLibraryParams();
  const { items, isLoading, error, refetch, isEmpty, allGenres, pagination } = useMediaLibrary({
    typeFilter: params.typeFilter,
    genreFilter: params.genreFilter,
    sortBy: params.sortBy,
    search: params.debouncedSearch,
    page: params.page,
    pageSize: params.pageSize,
  });

  useLibraryFiltersContext(params);

  const clampedPage = Math.min(params.page, Math.max(1, pagination.totalPages));
  const isLibraryEmpty =
    isEmpty && !params.debouncedSearch && params.typeFilter === 'all' && !params.genreFilter;

  return (
    <div className="space-y-6">
      <LibraryHeader />
      <DebriefBanner />
      <DownloadQueue />
      <LeavingSoonShelf />
      <LibraryFilters
        typeFilter={params.typeFilter}
        sortBy={params.sortBy}
        genreFilter={params.genreFilter}
        allGenres={allGenres}
        localSearch={params.localSearch}
        setLocalSearch={params.setLocalSearch}
        setParam={params.setParam}
      />
      <LibraryContent
        isLoading={isLoading}
        error={error}
        isLibraryEmpty={isLibraryEmpty}
        items={items}
        debouncedSearch={params.debouncedSearch}
        pageSize={params.pageSize}
        showTypeBadge={params.typeFilter === 'all'}
        clampedPage={clampedPage}
        totalPages={pagination.totalPages}
        totalItems={pagination.total}
        setLocalSearch={params.setLocalSearch}
        setParam={params.setParam}
        setPageSize={params.setPageSize}
        refetch={refetch}
      />
      <QuickPickFab />
    </div>
  );
}
