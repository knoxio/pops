import { useCallback, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { RecipeRenderer } from '../../components/RecipeRenderer.js';

import { unwrap } from '../../food-api-helpers.js';
import { recipesArchiveRecipe } from '../../food-api/index.js';
import { CookNowPortal } from './CookNowPortal.js';
import { MissingCurrentVersionBanner } from './MissingCurrentVersionBanner.js';
import { RecipeActionMenu, type RecipeActionMenuItem } from './RecipeActionMenu.js';
import { RecipeArchiveDialog } from './RecipeArchiveDialog.js';
import { RecipeScaleProvider, useRecipeScale } from './RecipeScaleProvider.js';
import { SendToListPortal } from './SendToListPortal.js';
import { buildCookMenuItem, canCookRecipe, useCookFlow } from './use-cook-flow.js';
import { buildSendMenuItem, canSendRecipe, useSendFlow } from './use-send-flow.js';
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
  const { scaleFactor } = useRecipeScale();
  const { data, draftCount, isLoading, error } = useRecipeDetailData({ slug });
  const archive = useArchiveFlow(slug);
  const send = useSendFlow();
  const cook = useCookFlow();

  if (isLoading) {
    return <Status text={t('recipes.detail.loading')} />;
  }
  if (error !== null && data === undefined) {
    return renderErrorBranch({ slug, error, draftCount, archive, t });
  }
  if (data === undefined) {
    // Defensive fall-through: query resolved with no data and no error.
    return (
      <Shell title={slug} draftCount={draftCount} onArchive={archive.open}>
        <MissingCurrentVersionBanner slug={slug} />
        <ArchiveDialogPortal slug={slug} title={slug} archive={archive} />
      </Shell>
    );
  }
  const sendMenuItem = buildSendMenuItem({
    label: t('recipes.detail.sendToList.menuItem'),
    canSend: canSendRecipe(data),
    onSelect: send.open,
  });
  const cookMenuItem = buildCookMenuItem({
    label: t('cook.menuItem'),
    canCook: canCookRecipe(data),
    onSelect: cook.open,
  });
  return (
    <Shell
      title={data.recipe.slug}
      draftCount={draftCount}
      onArchive={archive.open}
      extraItems={[cookMenuItem, sendMenuItem]}
    >
      <RecipeRenderer recipeVersion={data} scaleFactor={scaleFactor} variant="detail" />
      <ArchiveDialogPortal slug={slug} title={data.version.title} archive={archive} />
      <SendToListPortal flow={send} versionId={data.version.id} />
      <CookNowPortal flow={cook} versionId={data.version.id} />
    </Shell>
  );
}

interface ArchiveFlow {
  open: () => void;
  close: () => void;
  isOpen: boolean;
  isPending: boolean;
  confirm: (slug: string) => void;
}

function useArchiveFlow(_slug: string): ArchiveFlow {
  const { t } = useTranslation('food');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: async (slug: string) => unwrap(await recipesArchiveRecipe({ path: { slug } })),
    onSuccess: () => {
      toast.success(t('recipes.detail.archive.success'));
      void queryClient.invalidateQueries({ queryKey: ['food', 'recipes', 'list'] });
      void navigate('/food/recipes');
    },
    onError: (err: Error) => {
      toast.error(t('recipes.detail.archive.error', { message: err.message }));
    },
  });
  return {
    open: useCallback(() => setOpen(true), []),
    close: useCallback(() => setOpen(false), []),
    isOpen,
    isPending: mutation.isPending,
    confirm: (s: string) => {
      mutation.mutate(s);
    },
  };
}

interface ErrorBranchArgs {
  slug: string;
  error: Error;
  draftCount: number;
  archive: ArchiveFlow;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function renderErrorBranch({ slug, error, draftCount, archive, t }: ErrorBranchArgs): ReactElement {
  // PRD-119-API throws NOT_FOUND with three distinct message shapes; we
  // route "has no published version" to the missing-current banner so
  // the user isn't told "could not load recipe" when the cause is "no
  // version published yet" (drafts may still exist).
  if (/has no published version/i.test(error.message)) {
    return (
      <Shell title={slug} draftCount={draftCount} onArchive={archive.open}>
        <MissingCurrentVersionBanner slug={slug} />
        <ArchiveDialogPortal slug={slug} title={slug} archive={archive} />
      </Shell>
    );
  }
  if (/not found/i.test(error.message)) {
    return <NotFoundShell />;
  }
  return <Status text={t('recipes.detail.error', { message: error.message })} variant="error" />;
}

interface ShellProps {
  title: string;
  draftCount: number;
  onArchive: () => void;
  children: ReactElement | ReactElement[];
  extraItems?: RecipeActionMenuItem[];
}

function Shell({ title, draftCount, onArchive, children, extraItems }: ShellProps): ReactElement {
  return (
    <div className="space-y-4 p-6">
      <header className="flex items-start justify-between gap-4">
        <h1 className="sr-only">{title}</h1>
        <div className="ml-auto">
          <RecipeActionMenu
            slug={title}
            draftCount={draftCount}
            onArchive={onArchive}
            extraItems={extraItems}
          />
        </div>
      </header>
      {children}
    </div>
  );
}

function ArchiveDialogPortal({
  slug,
  title,
  archive,
}: {
  slug: string;
  title: string;
  archive: ArchiveFlow;
}): ReactElement {
  return (
    <RecipeArchiveDialog
      open={archive.isOpen}
      title={title}
      isPending={archive.isPending}
      onCancel={archive.close}
      onConfirm={() => archive.confirm(slug)}
    />
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
