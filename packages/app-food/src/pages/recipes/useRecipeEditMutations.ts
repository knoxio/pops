import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { unwrap } from '../../food-api-helpers.js';
import { recipesArchiveVersion, recipesPromote, recipesSaveDraft } from '../../food-api/index.js';
import { asCompileResult } from './recipe-payloads.js';

import type { RecipesSaveDraftResponses } from '../../food-api/types.gen.js';

type CompileResult = RecipesSaveDraftResponses[200]['compile'];

interface UseRecipeEditMutationsArgs {
  slug: string;
  versionId: number | null;
  dsl: string;
  setLatestCompile: (next: CompileResult | null) => void;
}

interface UseRecipeEditMutationsResult {
  save: () => void;
  promote: () => void;
  discard: () => void;
  recompile: () => void;
  isSaving: boolean;
  isPromoting: boolean;
  isDiscarding: boolean;
}

/**
 * Hoists the saveDraft / promote / archiveVersion mutation wiring out of
 * `RecipeEditPage` so the page component fits under the per-function
 * line cap. Returns memoised action callbacks the page consumes inline.
 */
export function useRecipeEditMutations(
  args: UseRecipeEditMutationsArgs
): UseRecipeEditMutationsResult {
  const { slug, versionId, dsl, setLatestCompile } = args;
  const { t } = useTranslation('food');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const saveMutation = useSaveMutation(setLatestCompile, t);
  const promoteMutation = usePromoteMutation(slug, navigate, queryClient, t);
  const discardMutation = useDiscardMutation(slug, navigate, t);

  const save = useCallback(() => {
    if (versionId === null) return;
    saveMutation.mutate({ versionId, dsl });
  }, [dsl, saveMutation, versionId]);

  const promote = useCallback(() => {
    if (versionId === null) return;
    promoteMutation.mutate({ versionId });
  }, [promoteMutation, versionId]);

  const discard = useCallback(() => {
    if (versionId === null) return;
    if (!window.confirm(t('recipes.edit.discardConfirm'))) return;
    discardMutation.mutate({ versionId });
  }, [discardMutation, t, versionId]);

  return {
    save,
    promote,
    discard,
    recompile: save,
    isSaving: saveMutation.isPending,
    isPromoting: promoteMutation.isPending,
    isDiscarding: discardMutation.isPending,
  };
}

interface SaveInput {
  versionId: number;
  dsl: string;
}

function useSaveMutation(
  setLatestCompile: (next: CompileResult | null) => void,
  t: (k: string, opts?: Record<string, unknown>) => string
) {
  return useMutation({
    mutationFn: async ({ versionId, dsl }: SaveInput) => {
      const res = unwrap(await recipesSaveDraft({ path: { versionId }, body: { dsl } }));
      return asCompileResult(res.compile);
    },
    onSuccess: (compile) => {
      setLatestCompile(compile);
      if (compile.ok === true) toast.success(t('recipes.edit.saved'));
      else toast.error(t('recipes.edit.compileFailed'));
    },
    onError: (err: Error) => toast.error(t('recipes.edit.saveError', { message: err.message })),
  });
}

type PromoteReason = 'ConcurrentPromotion' | 'CannotPromoteUncompiledVersion' | 'VersionNotFound';

function usePromoteMutation(
  slug: string,
  navigate: ReturnType<typeof useNavigate>,
  queryClient: ReturnType<typeof useQueryClient>,
  t: (k: string, opts?: Record<string, unknown>) => string
) {
  return useMutation({
    mutationFn: async ({ versionId }: { versionId: number }) =>
      unwrap(await recipesPromote({ path: { versionId } })),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(t('recipes.edit.promoted'));
        void queryClient.invalidateQueries({ queryKey: ['food', 'recipes', 'list'] });
        void navigate(`/food/recipes/${slug}`);
      } else {
        toast.error(t(`recipes.edit.promoteFailed.${res.reason satisfies PromoteReason}` as const));
      }
    },
    onError: (err: Error) => toast.error(t('recipes.edit.promoteError', { message: err.message })),
  });
}

function useDiscardMutation(
  slug: string,
  navigate: ReturnType<typeof useNavigate>,
  t: (k: string, opts?: Record<string, unknown>) => string
) {
  return useMutation({
    mutationFn: async ({ versionId }: { versionId: number }) =>
      unwrap(await recipesArchiveVersion({ path: { versionId } })),
    onSuccess: () => {
      toast.success(t('recipes.edit.discarded'));
      void navigate(`/food/recipes/${slug}`);
    },
    onError: (err: Error) => toast.error(t('recipes.edit.discardError', { message: err.message })),
  });
}
