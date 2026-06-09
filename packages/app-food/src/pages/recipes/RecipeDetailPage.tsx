import { useCallback, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { RecipeRenderer } from '../../components/RecipeRenderer.js';
import { MissingCurrentVersionBanner } from './MissingCurrentVersionBanner.js';
import { RecipeActionMenu } from './RecipeActionMenu.js';
import { RecipeArchiveDialog } from './RecipeArchiveDialog.js';
import { RecipeScaleProvider, useRecipeScale } from './RecipeScaleProvider.js';
import { useRecipeDetailData } from './useRecipeDetailData.js';

/**
 * `/food/recipes/:slug` — read view of the current version.
 *
 * Wraps PRD-121's `RecipeRenderer variant='detail'` with the recipe-page
 * shell: action menu, scale provider (forward-compat for PRD-142/144),
 * missing-current banner, and an archive confirm flow.
 */
export function RecipeDetailPage(): ReactElement {
  const { slug } = useParams<{ slug: string }>();
  if (slug === undefined) {
    return <NotFoundShell />;
  }
  return (
    <RecipeScaleProvider>
      <RecipeDetailBody slug={slug} />
    </RecipeScaleProvider>
  );
}

function RecipeDetailBody({ slug }: { slug: string }): ReactElement {
  const { t } = useTranslation('food');
  const navigate = useNavigate();
  const { scaleFactor } = useRecipeScale();
  const utils = trpc.useUtils();
  const { data, draftCount, isLoading, error } = useRecipeDetailData({ slug });

  const [archiveOpen, setArchiveOpen] = useState(false);
  const archiveMutation = trpc.food.recipes.archiveRecipe.useMutation({
    onSuccess: () => {
      toast.success(t('recipes.detail.archive.success'));
      void utils.food.recipes.list.invalidate();
      void navigate('/food/recipes');
    },
    onError: (err) => {
      toast.error(t('recipes.detail.archive.error', { message: err.message }));
    },
  });

  const onArchive = useCallback(() => setArchiveOpen(true), []);

  if (isLoading) {
    return <Status text={t('recipes.detail.loading')} />;
  }
  if (error !== null && data === undefined) {
    if (/not found/i.test(error.message)) {
      return <NotFoundShell />;
    }
    return <Status text={t('recipes.detail.error', { message: error.message })} variant="error" />;
  }
  if (data === undefined) {
    // The renderer requires a current version. Show the missing-banner
    // shell so the user can navigate to drafts.
    return (
      <Shell title={slug} draftCount={draftCount} onArchive={onArchive}>
        <MissingCurrentVersionBanner slug={slug} />
        <RecipeArchiveDialog
          open={archiveOpen}
          title={slug}
          isPending={archiveMutation.isPending}
          onCancel={() => setArchiveOpen(false)}
          onConfirm={() => {
            archiveMutation.mutate({ slug });
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell title={data.recipe.slug} draftCount={draftCount} onArchive={onArchive}>
      <RecipeRenderer recipeVersion={data} scaleFactor={scaleFactor} variant="detail" />
      <RecipeArchiveDialog
        open={archiveOpen}
        title={data.version.title}
        isPending={archiveMutation.isPending}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={() => {
          archiveMutation.mutate({ slug });
        }}
      />
    </Shell>
  );
}

interface ShellProps {
  title: string;
  draftCount: number;
  onArchive: () => void;
  children: ReactElement | ReactElement[];
}

function Shell({ title, draftCount, onArchive, children }: ShellProps): ReactElement {
  return (
    <div className="space-y-4 p-6">
      <header className="flex items-start justify-between gap-4">
        <h1 className="sr-only">{title}</h1>
        <div className="ml-auto">
          <RecipeActionMenu slug={title} draftCount={draftCount} onArchive={onArchive} />
        </div>
      </header>
      {children}
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

function NotFoundShell(): ReactElement {
  const { t } = useTranslation('food');
  return <Status text={t('recipes.detail.notFound')} variant="error" />;
}
