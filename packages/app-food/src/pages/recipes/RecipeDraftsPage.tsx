import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';
import { Button } from '@pops/ui';

import { DraftRowCard } from './DraftRowCard.js';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';

type ListDraftsOutput = inferRouterOutputs<AppRouter>['food']['recipes']['listDrafts'];

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
  const utils = usePillarUtils('food');
  const draftsQuery = usePillarQuery<ListDraftsOutput>('food', ['recipes', 'listDrafts'], {
    slug,
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
    // tRPC's NOT_FOUND (unknown slug) gets a fully-localised copy via
    // recipes.detail.notFound. Other errors fall back to the generic
    // localised template with the server message appended.
    if (isTrpcNotFound(draftsQuery.error)) {
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
        <ul className="space-y-2" aria-label={t('recipes.drafts.listAriaLabel')}>
          {drafts.map((d) => (
            <li key={d.versionId}>
              <DraftRowCard
                slug={slug}
                draft={d}
                refetch={() => utils.invalidate(['recipes', 'listDrafts'])}
                t={t}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
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

/**
 * `useQuery.error` is a `TRPCClientErrorLike` whose `.data.code` carries
 * the tRPC error code. Check the code directly so the not-found branch
 * doesn't rely on regex-matching English server messages.
 */
function isTrpcNotFound(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const data = (err as { data?: { code?: unknown } }).data;
  return (
    typeof data === 'object' && data !== null && (data as { code?: unknown }).code === 'NOT_FOUND'
  );
}
