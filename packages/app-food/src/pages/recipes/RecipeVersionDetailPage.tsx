import { useCallback, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { RecipeRenderer } from '../../components/RecipeRenderer.js';
import { RecipeScaleProvider, useRecipeScale } from './RecipeScaleProvider.js';
import { useRecipeDetailData } from './useRecipeDetailData.js';

/**
 * `/food/recipes/:slug/v/:versionNo` — read view of a specific historic
 * version. Adds a status badge in the top bar and a "Restore as new
 * draft" button that creates a fresh draft copying this version's
 * bodyDsl, then routes to the edit page.
 */
export function RecipeVersionDetailPage(): ReactElement {
  const { slug, versionNo } = useParams<{ slug: string; versionNo: string }>();
  if (slug === undefined || versionNo === undefined) {
    return <Status text="Recipe or version missing in URL" variant="error" />;
  }
  const parsedVersion = Number(versionNo);
  if (!Number.isInteger(parsedVersion) || parsedVersion <= 0) {
    return <Status text="Bad versionNo in URL" variant="error" />;
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
  const { data, isLoading, error } = useRecipeDetailData({ slug, versionNo });

  const restoreMutation = trpc.food.recipes.restoreVersion.useMutation({
    onSuccess: () => {
      toast.success(t('recipes.versionDetail.restore.success'));
      void navigate(`/food/recipes/${slug}/edit`);
    },
    onError: (err) => {
      toast.error(t('recipes.versionDetail.restore.error', { message: err.message }));
    },
  });

  const onRestore = useCallback(() => {
    if (data === undefined) return;
    restoreMutation.mutate({ sourceVersionId: data.version.id });
  }, [data, restoreMutation]);

  if (isLoading) return <Status text={t('recipes.detail.loading')} />;
  if (error !== null) {
    if (/not found/i.test(error.message)) {
      return <Status text={t('recipes.versionDetail.notFound')} variant="error" />;
    }
    return <Status text={t('recipes.detail.error', { message: error.message })} variant="error" />;
  }
  if (data === undefined) return <Status text={t('recipes.detail.loading')} />;

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
        <div className="space-y-1">
          <p className="text-sm">
            {t('recipes.versionDetail.viewing', {
              versionNo,
              status: t(`recipes.versionDetail.status.${data.version.status}`),
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('recipes.versionDetail.created', { date: data.version.createdAt })}
          </p>
        </div>
        <button
          type="button"
          onClick={onRestore}
          disabled={restoreMutation.isPending}
          className="rounded-md border bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {restoreMutation.isPending
            ? t('recipes.versionDetail.restore.pending')
            : t('recipes.versionDetail.restore.cta')}
        </button>
      </header>
      <RecipeRenderer recipeVersion={data} scaleFactor={scaleFactor} variant="detail" />
    </div>
  );
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
