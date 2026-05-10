/**
 * EngramsListPage — the `/cerebrum/engrams` route (PRD-077, PRD-080).
 *
 * Shows a paginated, filterable list of engrams. The search box drives
 * `cerebrum.retrieval.search` (hybrid mode) when populated; otherwise
 * the page uses `cerebrum.engrams.list` directly. Filter state lives
 * in the view-model hook.
 */
import { Library } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, EmptyState, Input, PageHeader, Skeleton } from '@pops/ui';

import { useEngramListModel } from '../engrams/useEngramListModel';
import { EngramFilterBar } from './engrams-list/EngramFilterBar';
import { EngramTable } from './engrams-list/EngramTable';

const TOUCH_TARGET_MIN_HEIGHT = 'min-h-[44px]';

type Model = ReturnType<typeof useEngramListModel>;

function PaginationControls({ model }: { model: Model }) {
  const { t } = useTranslation('cerebrum');
  const start = model.page * model.pageSize;
  const end = start + model.engrams.length;
  const hasNext = end < model.total;
  const hasPrev = model.page > 0;

  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>{t('engrams.list.results', { count: model.total })}</span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!hasPrev}
          onClick={() => model.setPage(model.page - 1)}
          className={TOUCH_TARGET_MIN_HEIGHT}
        >
          {t('engrams.list.previous')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!hasNext}
          onClick={() => model.setPage(model.page + 1)}
          className={TOUCH_TARGET_MIN_HEIGHT}
        >
          {t('engrams.list.next')}
        </Button>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-2" data-testid="engrams-loading">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function ErrorState({ model }: { model: Model }) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="p-6 text-center" data-testid="engrams-error">
      <p className="text-destructive mb-3">
        {t('engrams.list.error', { message: model.error?.message ?? '' })}
      </p>
      <Button variant="outline" size="sm" onClick={model.retry} className={TOUCH_TARGET_MIN_HEIGHT}>
        {t('engrams.list.retry')}
      </Button>
    </div>
  );
}

function EmptyResults() {
  const { t } = useTranslation('cerebrum');
  return (
    <EmptyState
      icon={Library}
      title={t('engrams.list.empty.title')}
      description={t('engrams.list.empty.description')}
    />
  );
}

function ListBody({ model }: { model: Model }) {
  if (model.isLoading) return <LoadingState />;
  if (model.error) return <ErrorState model={model} />;
  if (model.engrams.length === 0) return <EmptyResults />;
  return (
    <div className="space-y-4" data-testid="engrams-list">
      <EngramTable engrams={model.engrams} />
      <PaginationControls model={model} />
    </div>
  );
}

export function EngramsListPage() {
  const { t } = useTranslation('cerebrum');
  const model = useEngramListModel();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <PageHeader title={t('engrams.title')} description={t('engrams.description')} />
      <div className="space-y-4">
        <Input
          type="search"
          aria-label={t('engrams.search')}
          placeholder={t('engrams.searchPlaceholder')}
          value={model.filters.search}
          onChange={(e) => model.setFilters({ ...model.filters, search: e.currentTarget.value })}
          className={TOUCH_TARGET_MIN_HEIGHT}
        />
        <EngramFilterBar model={model} />
      </div>
      <ListBody model={model} />
    </div>
  );
}
