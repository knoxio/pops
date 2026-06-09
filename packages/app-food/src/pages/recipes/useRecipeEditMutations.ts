import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import type { CompileResult } from '@pops/app-food-db';

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
  const utils = trpc.useUtils();
  const saveMutation = useSaveMutation(setLatestCompile, t);
  const promoteMutation = usePromoteMutation(slug, navigate, utils, t);
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

function useSaveMutation(
  setLatestCompile: (next: CompileResult | null) => void,
  t: (k: string, opts?: Record<string, unknown>) => string
) {
  return trpc.food.recipes.saveDraft.useMutation({
    onSuccess: (res) => {
      setLatestCompile(res.compile);
      if (res.compile.ok === true) toast.success(t('recipes.edit.saved'));
      else toast.error(t('recipes.edit.compileFailed'));
    },
    onError: (err) => toast.error(t('recipes.edit.saveError', { message: err.message })),
  });
}

function usePromoteMutation(
  slug: string,
  navigate: ReturnType<typeof useNavigate>,
  utils: ReturnType<typeof trpc.useUtils>,
  t: (k: string, opts?: Record<string, unknown>) => string
) {
  return trpc.food.recipes.promote.useMutation({
    onSuccess: (res) => {
      if (res.ok === true) {
        toast.success(t('recipes.edit.promoted'));
        void utils.food.recipes.list.invalidate();
        void navigate(`/food/recipes/${slug}`);
      } else {
        toast.error(t(`recipes.edit.promoteFailed.${res.reason}` as const));
      }
    },
    onError: (err) => toast.error(t('recipes.edit.promoteError', { message: err.message })),
  });
}

function useDiscardMutation(
  slug: string,
  navigate: ReturnType<typeof useNavigate>,
  t: (k: string, opts?: Record<string, unknown>) => string
) {
  return trpc.food.recipes.archiveVersion.useMutation({
    onSuccess: () => {
      toast.success(t('recipes.edit.discarded'));
      void navigate(`/food/recipes/${slug}`);
    },
    onError: (err) => toast.error(t('recipes.edit.discardError', { message: err.message })),
  });
}
