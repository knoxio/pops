import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { usePillarQuery } from '@pops/pillar-sdk/react';

import { RecipeEditShell } from './RecipeEditPage.js';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';

type ListDraftsOutput = inferRouterOutputs<AppRouter>['food']['recipes']['listDrafts'];

/**
 * `/food/recipes/:slug/drafts/:draftNo` — same edit surface as
 * `RecipeEditPage` but targets the explicit draft. We resolve the
 * (versionId, versionNo) via `listDrafts({ slug })` and hand it off to
 * the shared `RecipeEditShell`.
 *
 * 404 paths: unknown slug → server returns NOT_FOUND on `listDrafts`,
 * which we surface as an alert. Unknown draftNo (or one belonging to a
 * promoted/archived version) → the shell never receives a versionId
 * and we show the localized not-found copy.
 */
export function RecipeDraftEditPage(): ReactElement {
  const { t } = useTranslation('food');
  const { slug, draftNo } = useParams<{ slug: string; draftNo: string }>();
  if (slug === undefined || draftNo === undefined) {
    return <Alert text={t('recipes.draftEdit.urlMissing')} />;
  }
  const parsed = Number(draftNo);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return <Alert text={t('recipes.draftEdit.badDraftNo')} />;
  }
  return <RecipeDraftEditBody key={`${slug}:${draftNo}`} slug={slug} draftNo={parsed} />;
}

function RecipeDraftEditBody({ slug, draftNo }: { slug: string; draftNo: number }): ReactElement {
  const { t } = useTranslation('food');
  const draftsQuery = usePillarQuery<ListDraftsOutput>('food', ['recipes', 'listDrafts'], {
    slug,
  });
  const match = useMemo(
    () => draftsQuery.data?.drafts.find((d) => d.versionNo === draftNo) ?? null,
    [draftNo, draftsQuery.data]
  );

  if (draftsQuery.isLoading) {
    return <Status text={t('recipes.draftEdit.loading')} />;
  }
  if (draftsQuery.error !== null) {
    if (isTrpcNotFound(draftsQuery.error)) {
      return <Alert text={t('recipes.detail.notFound')} />;
    }
    return <Alert text={t('recipes.draftEdit.error', { message: draftsQuery.error.message })} />;
  }
  if (match === null) {
    return <Alert text={t('recipes.draftEdit.notFound', { draftNo })} />;
  }
  return <RecipeEditShell slug={slug} versionId={match.versionId} versionNo={match.versionNo} />;
}

function Status({ text }: { text: string }): ReactElement {
  return (
    <p role="status" className="p-6 text-sm text-muted-foreground">
      {text}
    </p>
  );
}

function Alert({ text }: { text: string }): ReactElement {
  return (
    <p role="alert" className="p-6 text-sm text-destructive">
      {text}
    </p>
  );
}

/**
 * Detect tRPC NOT_FOUND via `error.data.code` so the not-found branch
 * doesn't depend on regex-matching English server messages.
 */
function isTrpcNotFound(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const data = (err as { data?: { code?: unknown } }).data;
  return (
    typeof data === 'object' && data !== null && (data as { code?: unknown }).code === 'NOT_FOUND'
  );
}
