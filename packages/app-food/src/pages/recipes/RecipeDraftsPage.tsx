import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { Button } from '@pops/ui';

import { isNotFoundError, unwrap } from '../../food-api-helpers.js';
import { recipesListDrafts } from '../../food-api/index.js';
import { DraftRowCard, type DraftRow } from './DraftRowCard.js';

/**
 * `/food/recipes/:slug/drafts` — list of every `status='draft'` version
 * for the recipe. Each row offers Edit (→ `/drafts/:draftNo`),
 * Promote (if compiled), Discard (archives the version).
 */
export function RecipeDraftsPage(): ReactElement {
  const { t } = useTranslation('food');
  const { slug } = useParams<{ slug: string }>();
  if (slug === undefined) {
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        {t('recipes.drafts.urlMissing')}
      </p>
    );
  }
  return <RecipeDraftsBody slug={slug} />;
}

function RecipeDraftsBody({ slug }: { slug: string }): ReactElement {
  const { t } = useTranslation('food');
  const queryClient = useQueryClient();
  const draftsQuery = useQuery({
    queryKey: ['food', 'recipes', 'listDrafts', { slug }],
    queryFn: async () => unwrap(await recipesListDrafts({ path: { slug } })),
  });
  const drafts = draftsQuery.data?.drafts ?? [];

  if (draftsQuery.isLoading) {
    return (
      <p role="status" className="p-6 text-sm text-muted-foreground">
        {t('recipes.drafts.loading')}
      </p>
    );
  }
  if (draftsQuery.error !== null) {
    // NOT_FOUND (unknown slug) gets a fully-localised copy via
    // recipes.detail.notFound. Other errors fall back to the generic
    // localised template with the server message appended.
    if (isNotFoundError(draftsQuery.error)) {
      return (
        <p role="alert" className="p-6 text-sm text-destructive">
          {t('recipes.detail.notFound')}
        </p>
      );
    }
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        {t('recipes.drafts.error', { message: draftsQuery.error.message })}
      </p>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">
            {t('recipes.drafts.title', { slug })}
          </h1>
          <p className="text-sm text-muted-foreground">{t('recipes.drafts.intro')}</p>
        </div>
        <Button asChild variant="outline">
          <Link to={`/food/recipes/${slug}`}>{t('recipes.drafts.back')}</Link>
        </Button>
      </header>

      {drafts.length === 0 ? (
        <EmptyState slug={slug} t={t} />
      ) : (
        <DraftsList slug={slug} drafts={drafts} queryClient={queryClient} t={t} />
      )}
    </div>
  );
}

interface DraftsListProps {
  slug: string;
  drafts: readonly DraftRow[];
  queryClient: ReturnType<typeof useQueryClient>;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function DraftsList({ slug, drafts, queryClient, t }: DraftsListProps): ReactElement {
  const refetch = () =>
    queryClient.invalidateQueries({ queryKey: ['food', 'recipes', 'listDrafts'] });
  return (
    <ul className="space-y-2" aria-label={t('recipes.drafts.listAriaLabel')}>
      {drafts.map((d) => (
        <li key={d.versionId}>
          <DraftRowCard slug={slug} draft={d} refetch={refetch} t={t} />
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ slug, t }: { slug: string; t: (key: string) => string }): ReactElement {
  return (
    <div className="rounded-md border border-dashed p-10 text-center">
      <p className="mb-3 text-base font-medium">{t('recipes.drafts.empty.title')}</p>
      <Button asChild>
        <Link to={`/food/recipes/${slug}/edit`}>{t('recipes.drafts.empty.cta')}</Link>
      </Button>
    </div>
  );
}
