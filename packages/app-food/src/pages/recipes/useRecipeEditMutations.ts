import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { usePillarMutation, usePillarUtils } from '@pops/pillar-sdk/react';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';
import type { CompileResult } from '@pops/app-food-db';

type SaveDraftInput = inferRouterInputs<AppRouter>['food']['recipes']['saveDraft'];
type SaveDraftOutput = inferRouterOutputs<AppRouter>['food']['recipes']['saveDraft'];
type PromoteInput = inferRouterInputs<AppRouter>['food']['recipes']['promote'];
type PromoteOutput = inferRouterOutputs<AppRouter>['food']['recipes']['promote'];
type ArchiveVersionInput = inferRouterInputs<AppRouter>['food']['recipes']['archiveVersion'];
type ArchiveVersionOutput = inferRouterOutputs<AppRouter>['food']['recipes']['archiveVersion'];

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
  const utils = usePillarUtils('food');
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
  return usePillarMutation<SaveDraftInput, SaveDraftOutput>('food', ['recipes', 'saveDraft'], {
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
  utils: ReturnType<typeof usePillarUtils>,
  t: (k: string, opts?: Record<string, unknown>) => string
) {
  return usePillarMutation<PromoteInput, PromoteOutput>('food', ['recipes', 'promote'], {
    onSuccess: (res) => {
      if (res.ok === true) {
        toast.success(t('recipes.edit.promoted'));
        void utils.invalidate(['recipes', 'list']);
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
  return usePillarMutation<ArchiveVersionInput, ArchiveVersionOutput>(
    'food',
    ['recipes', 'archiveVersion'],
    {
      onSuccess: () => {
        toast.success(t('recipes.edit.discarded'));
        void navigate(`/food/recipes/${slug}`);
      },
      onError: (err) => toast.error(t('recipes.edit.discardError', { message: err.message })),
    }
  );
}
