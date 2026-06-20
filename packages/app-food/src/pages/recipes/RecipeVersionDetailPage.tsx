import { useMutation } from '@tanstack/react-query';
import { useCallback, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { RecipeRenderer } from '../../components/RecipeRenderer.js';
import { unwrap } from '../../food-api-helpers.js';
import { recipesRestoreVersion } from '../../food-api/index.js';

import type { RecipeVersionWithCompiledData } from '../../components/recipe-render-types.js';

type RecipeVersionRow = RecipeVersionWithCompiledData['version'];
import { RecipeScaleProvider, useRecipeScale } from './RecipeScaleProvider.js';
import { useRecipeDetailData } from './useRecipeDetailData.js';

/**
 * `/food/recipes/:slug/v/:versionNo` — read view of a specific historic
 * version. Adds a status badge in the top bar and a "Restore as new
 * draft" button that creates a fresh draft copying this version's
 * bodyDsl, then routes to the edit page.
 */
export function RecipeVersionDetailPage(): ReactElement {
  const { t } = useTranslation('food');
  const { slug, versionNo } = useParams<{ slug: string; versionNo: string }>();
  if (slug === undefined || versionNo === undefined) {
    return <Status text={t('recipes.versionDetail.urlMissing')} variant="error" />;
  }
  const parsedVersion = Number(versionNo);
  if (!Number.isInteger(parsedVersion) || parsedVersion <= 0) {
    return <Status text={t('recipes.versionDetail.badVersionNo')} variant="error" />;
  }
  return (
    <RecipeScaleProvider>
      <RecipeVersionDetailBody slug={slug} versionNo={parsedVersion} />
    </RecipeScaleProvider>
  );
}

interface BodyProps {
  slug: string;
  versionNo: number;
}

function RecipeVersionDetailBody({ slug, versionNo }: BodyProps): ReactElement {
  const { t } = useTranslation('food');
  const navigate = useNavigate();
  const { scaleFactor } = useRecipeScale();
  // The historic-version page never surfaces the draft count, so skip
  // the listDrafts fetch.
  const { data, isLoading, error } = useRecipeDetailData({
    slug,
    versionNo,
    includeDrafts: false,
  });

  const restoreMutation = useMutation({
    mutationFn: async (versionId: number) =>
      unwrap(await recipesRestoreVersion({ path: { versionId } })),
    onSuccess: () => {
      toast.success(t('recipes.versionDetail.restore.success'));
      void navigate(`/food/recipes/${slug}/edit`);
    },
    onError: (err: Error) => {
      toast.error(t('recipes.versionDetail.restore.error', { message: err.message }));
    },
  });

  const onRestore = useCallback(() => {
    if (data === undefined) return;
    restoreMutation.mutate(data.version.id);
  }, [data, restoreMutation]);

  if (isLoading) return <Status text={t('recipes.detail.loading')} />;
  if (error !== null) {
    // PRD-119-API throws NOT_FOUND with message "Recipe \"<slug>\" has no
    // version <n>" for an out-of-range versionNo and "Recipe \"<slug>\"
    // not found" for an unknown slug. Either way, the user is looking at
    // a non-existent version, so we show the same not-found copy.
    if (isVersionLookupNotFound(error)) {
      return <Status text={t('recipes.versionDetail.notFound')} variant="error" />;
    }
    return <Status text={t('recipes.detail.error', { message: error.message })} variant="error" />;
  }
  if (data === undefined) return <Status text={t('recipes.detail.loading')} />;

  return (
    <div className="space-y-4 p-6">
      <VersionDetailHeader
        versionNo={versionNo}
        status={data.version.status}
        createdAt={data.version.createdAt}
        onRestore={onRestore}
        isRestoring={restoreMutation.isPending}
      />
      <RecipeRenderer recipeVersion={data} scaleFactor={scaleFactor} variant="detail" />
    </div>
  );
}

interface VersionDetailHeaderProps {
  versionNo: number;
  status: RecipeVersionRow['status'];
  createdAt: RecipeVersionRow['createdAt'];
  onRestore: () => void;
  isRestoring: boolean;
}

function VersionDetailHeader({
  versionNo,
  status,
  createdAt,
  onRestore,
  isRestoring,
}: VersionDetailHeaderProps): ReactElement {
  const { t } = useTranslation('food');
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
      <div className="space-y-1">
        <p className="text-sm">
          {t('recipes.versionDetail.viewing', {
            versionNo,
            status: t(`recipes.versionDetail.status.${status}`),
          })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('recipes.versionDetail.created', { date: createdAt })}
        </p>
      </div>
      <button
        type="button"
        onClick={onRestore}
        disabled={isRestoring}
        className="rounded-md border bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isRestoring
          ? t('recipes.versionDetail.restore.pending')
          : t('recipes.versionDetail.restore.cta')}
      </button>
    </header>
  );
}

/**
 * tRPC's `useQuery.error` is a `TRPCClientErrorLike` whose `.data.code`
 * carries the structured status. Match on the code so the not-found
 * detection doesn't depend on the human-readable message.
 */
function isVersionLookupNotFound(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const data = (err as { data?: { code?: unknown } }).data;
  if (data && typeof data === 'object' && data.code === 'NOT_FOUND') return true;
  // Fallback for non-tRPC errors (e.g. mocked test errors): match on the
  // two server-side message shapes.
  if (err instanceof Error) {
    return /has no version|not found/i.test(err.message);
  }
  return false;
}

function Status({
  text,
  variant = 'info',
}: {
  text: string;
  variant?: 'info' | 'error';
}): ReactElement {
  return (
    <p
      className={
        variant === 'error' ? 'p-6 text-sm text-destructive' : 'p-6 text-sm text-muted-foreground'
      }
      role={variant === 'error' ? 'alert' : 'status'}
    >
      {text}
    </p>
  );
}
