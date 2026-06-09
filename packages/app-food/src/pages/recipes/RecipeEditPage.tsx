import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { Button } from '@pops/ui';

import { DslEditor } from '../../components/DslEditor.js';
import { AutoCreatedBanner } from './AutoCreatedBanner.js';
import { buildEditorIssues } from './compile-result-issues.js';
import { useRecipeEditMutations } from './useRecipeEditMutations.js';

import type { CompileResult } from '@pops/app-food-db';

/**
 * `/food/recipes/:slug/edit` — edits the latest draft of `:slug`. If the
 * current version is published, a fresh draft is created on mount via
 * `createNewDraft` (idempotent: same draft is returned if one exists).
 * Save / promote / discard map straight to the matching mutations;
 * compile-result errors flow back as PRD-120-C `issues`.
 */
export function RecipeEditPage(): ReactElement {
  const { slug } = useParams<{ slug: string }>();
  if (slug === undefined) {
    return <Status text="Recipe slug missing in URL" variant="error" />;
  }
  return <RecipeEditBody slug={slug} />;
}

function RecipeEditBody({ slug }: { slug: string }): ReactElement {
  const { t } = useTranslation('food');
  const [versionId, setVersionId] = useState<number | null>(null);
  const [dsl, setDsl] = useState<string>('');
  const [latestCompile, setLatestCompile] = useState<CompileResult | null>(null);

  const createDraftMutation = trpc.food.recipes.createNewDraft.useMutation({
    onSuccess: (res) => setVersionId(res.versionId),
    onError: (err) => toast.error(t('recipes.edit.openError', { message: err.message })),
  });

  useEffect(() => {
    if (versionId === null) createDraftMutation.mutate({ slug });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const proposedSlugsQuery = trpc.food.recipes.listProposedSlugs.useQuery(
    { versionId: versionId ?? 0 },
    { enabled: versionId !== null }
  );
  const proposedRows = proposedSlugsQuery.data?.items ?? [];

  const actions = useRecipeEditMutations({ slug, versionId, dsl, setLatestCompile });
  const issues = buildEditorIssues(latestCompile, proposedRows);
  const canPromote = latestCompile !== null && latestCompile.ok === true && !actions.isSaving;

  if (versionId === null) {
    return <Status text={t('recipes.edit.opening')} />;
  }

  return (
    <div className="space-y-4 p-6">
      <EditHeader slug={slug} canPromote={canPromote} actions={actions} />
      <AutoCreatedBanner slugs={proposedRows.map((r) => r.slug)} />
      <DslEditor initialValue={dsl} onChange={setDsl} issues={issues} />
    </div>
  );
}

interface EditHeaderProps {
  slug: string;
  canPromote: boolean;
  actions: ReturnType<typeof useRecipeEditMutations>;
}

function EditHeader({ slug, canPromote, actions }: EditHeaderProps): ReactElement {
  const { t } = useTranslation('food');
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-bold tracking-tight">{t('recipes.edit.title', { slug })}</h1>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={actions.discard} disabled={actions.isDiscarding}>
          {t('recipes.edit.discard')}
        </Button>
        <Button variant="outline" onClick={actions.recompile} disabled={actions.isSaving}>
          {t('recipes.edit.recompile')}
        </Button>
        <Button onClick={actions.save} disabled={actions.isSaving}>
          {actions.isSaving ? t('recipes.edit.savingPending') : t('recipes.edit.save')}
        </Button>
        <Button onClick={actions.promote} disabled={!canPromote || actions.isPromoting}>
          {actions.isPromoting ? t('recipes.edit.promoting') : t('recipes.edit.promote')}
        </Button>
      </div>
    </header>
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
