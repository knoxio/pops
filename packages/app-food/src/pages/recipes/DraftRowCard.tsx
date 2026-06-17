import { type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@pops/ui';

import { unwrap } from '../../food-api-helpers.js';
import { recipesArchiveVersion, recipesPromote } from '../../food-api/index.js';

type PromoteReason = 'ConcurrentPromotion' | 'CannotPromoteUncompiledVersion' | 'VersionNotFound';

export interface DraftRow {
  versionId: number;
  versionNo: number;
  title: string;
  compileStatus: 'uncompiled' | 'compiled' | 'failed';
  createdAt: string;
  preview: string;
}

interface DraftRowProps {
  slug: string;
  draft: DraftRow;
  /**
   * Fired after a successful promote/discard. Returns a Promise (the
   * caller wraps `utils.food.recipes.listDrafts.invalidate`); the row
   * deliberately doesn't await it but tracks the type so future
   * refactors can.
   */
  refetch: () => Promise<unknown>;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

/** Single-row card for `RecipeDraftsPage`. */
export function DraftRowCard({ slug, draft, refetch, t }: DraftRowProps): ReactElement {
  const mutations = useDraftRowMutations(slug, refetch, t);
  return (
    <article className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-card p-4">
      <DraftRowSummary draft={draft} t={t} />
      <DraftRowActions slug={slug} draft={draft} mutations={mutations} t={t} />
    </article>
  );
}

interface DraftRowMutations {
  promote: (versionId: number) => void;
  discard: (versionId: number) => void;
  isPromoting: boolean;
  isDiscarding: boolean;
  isPending: boolean;
}

function useDraftRowMutations(
  slug: string,
  refetch: () => Promise<unknown>,
  t: (key: string, opts?: Record<string, unknown>) => string
): DraftRowMutations {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const promoteMutation = useMutation({
    mutationFn: async (versionId: number) =>
      unwrap(await recipesPromote({ path: { versionId } })),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(t('recipes.drafts.row.promoted'));
        void queryClient.invalidateQueries({ queryKey: ['food', 'recipes', 'list'] });
        void refetch();
        void navigate(`/food/recipes/${slug}`);
      } else {
        toast.error(t(`recipes.edit.promoteFailed.${res.reason satisfies PromoteReason}` as const));
      }
    },
    onError: (err: Error) =>
      toast.error(t('recipes.drafts.row.promoteError', { message: err.message })),
  });
  const discardMutation = useMutation({
    mutationFn: async (versionId: number) =>
      unwrap(await recipesArchiveVersion({ path: { versionId } })),
    onSuccess: () => {
      toast.success(t('recipes.drafts.row.discarded'));
      void refetch();
    },
    onError: (err: Error) =>
      toast.error(t('recipes.drafts.row.discardError', { message: err.message })),
  });
  return {
    promote: (versionId) => promoteMutation.mutate(versionId),
    discard: (versionId) => discardMutation.mutate(versionId),
    isPromoting: promoteMutation.isPending,
    isDiscarding: discardMutation.isPending,
    isPending: promoteMutation.isPending || discardMutation.isPending,
  };
}

interface DraftRowSummaryProps {
  draft: DraftRow;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function DraftRowSummary({ draft, t }: DraftRowSummaryProps): ReactElement {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-base font-semibold">
          {t('recipes.drafts.row.version', { versionNo: draft.versionNo })}
        </h2>
        <CompileBadge status={draft.compileStatus} t={t} />
        <span className="text-xs text-muted-foreground">{draft.createdAt}</span>
      </div>
      <p className="text-sm text-muted-foreground">{draft.title}</p>
      <p className="font-mono text-xs text-muted-foreground line-clamp-2">{draft.preview}</p>
    </div>
  );
}

interface DraftRowActionsProps {
  slug: string;
  draft: DraftRow;
  mutations: DraftRowMutations;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function DraftRowActions({ slug, draft, mutations, t }: DraftRowActionsProps): ReactElement {
  const canPromote = draft.compileStatus === 'compiled';
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        <Link to={`/food/recipes/${slug}/drafts/${draft.versionNo}`}>
          {t('recipes.drafts.row.edit')}
        </Link>
      </Button>
      <Button
        size="sm"
        disabled={!canPromote || mutations.isPending}
        onClick={() => mutations.promote(draft.versionId)}
      >
        {mutations.isPromoting
          ? t('recipes.drafts.row.promoting')
          : t('recipes.drafts.row.promote')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={mutations.isPending}
        onClick={() => {
          if (!window.confirm(t('recipes.drafts.row.discardConfirm'))) return;
          mutations.discard(draft.versionId);
        }}
      >
        {t('recipes.drafts.row.discard')}
      </Button>
    </div>
  );
}

function CompileBadge({
  status,
  t,
}: {
  status: 'uncompiled' | 'compiled' | 'failed';
  t: (key: string) => string;
}): ReactElement {
  const variantClass = badgeVariantClass(status);
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xs ${variantClass}`}>
      {t(`recipes.drafts.row.status.${status}`)}
    </span>
  );
}

function badgeVariantClass(status: 'uncompiled' | 'compiled' | 'failed'): string {
  if (status === 'compiled') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700';
  if (status === 'failed') return 'border-destructive/40 bg-destructive/10 text-destructive';
  return 'border-muted-foreground/40 bg-muted/40 text-muted-foreground';
}
