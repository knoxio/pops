/**
 * The three ingredient-action tRPC mutations (rename / changeParent /
 * delete), wrapped so `useIngredientActions` can stay declarative.
 *
 * On delete:
 *   - `{ ok: true }`              → close all dialogs, invalidate caches
 *   - `{ ok: false, blockers }`   → leave the modal open, refetch blockers
 *   - `TRPCError code='CONFLICT'` → set `hasOtherFkRefs` so the dialog
 *     surfaces the generic "other refs" copy for FK violations not
 *     enumerated by `getIngredientDeleteBlockers`
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePillarMutation, usePillarUtils } from '@pops/pillar-sdk/react';

import { mapMutationError } from './errors';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { TFunction } from 'i18next';

import type { AppRouter } from '@pops/api-client';

type RenameInput = inferRouterInputs<AppRouter>['food']['ingredients']['rename'];
type RenameOutput = inferRouterOutputs<AppRouter>['food']['ingredients']['rename'];
type ChangeParentInput = inferRouterInputs<AppRouter>['food']['ingredients']['changeParent'];
type ChangeParentOutput = inferRouterOutputs<AppRouter>['food']['ingredients']['changeParent'];
type DeleteInput = inferRouterInputs<AppRouter>['food']['ingredients']['delete'];
type DeleteOutput = inferRouterOutputs<AppRouter>['food']['ingredients']['delete'];

interface ErrorState {
  rename: string | null;
  changeParent: string | null;
  delete: string | null;
}

const EMPTY_ERRORS: ErrorState = { rename: null, changeParent: null, delete: null };

interface Args {
  closeAll: () => void;
  onDeleteOtherFkRef: () => void;
}

function isConflictError(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const candidate = (err as { data?: unknown }).data;
  if (candidate === null || typeof candidate !== 'object') return false;
  return (candidate as { code?: unknown }).code === 'CONFLICT';
}

function deriveDeleteError(
  err: { data?: { code?: string } | null; message: string },
  t: TFunction
): string {
  if (isConflictError(err)) return t('data.ingredients.delete.blockers.otherRefs');
  return mapMutationError(err, t, { fallbackKey: 'data.ingredients.delete.error.generic' });
}

type SetErrors = (updater: (prev: ErrorState) => ErrorState) => void;

function useRenameMutation(
  invalidate: () => Promise<void>,
  closeAll: () => void,
  setErrors: SetErrors,
  t: TFunction
) {
  return usePillarMutation<RenameInput, RenameOutput>('food', ['ingredients', 'rename'], {
    onSuccess: async () => {
      await invalidate();
      closeAll();
    },
    onError: (err) =>
      setErrors((prev) => ({
        ...prev,
        rename: mapMutationError(err, t, { fallbackKey: 'data.ingredients.rename.error.generic' }),
      })),
  });
}

function useChangeParentMutation(
  invalidate: () => Promise<void>,
  closeAll: () => void,
  setErrors: SetErrors,
  t: TFunction
) {
  return usePillarMutation<ChangeParentInput, ChangeParentOutput>(
    'food',
    ['ingredients', 'changeParent'],
    {
      onSuccess: async () => {
        await invalidate();
        closeAll();
      },
      onError: (err) =>
        setErrors((prev) => ({
          ...prev,
          changeParent: mapMutationError(err, t, {
            fallbackKey: 'data.ingredients.changeParent.error.generic',
          }),
        })),
    }
  );
}

interface UseDeleteMutationArgs {
  invalidate: () => Promise<void>;
  closeAll: () => void;
  setErrors: SetErrors;
  onDeleteOtherFkRef: () => void;
  utils: ReturnType<typeof usePillarUtils>;
  t: TFunction;
}

function useDeleteMutation({
  invalidate,
  closeAll,
  setErrors,
  onDeleteOtherFkRef,
  utils,
  t,
}: UseDeleteMutationArgs) {
  return usePillarMutation<DeleteInput, DeleteOutput>('food', ['ingredients', 'delete'], {
    onSuccess: async (result) => {
      if (result.ok) {
        await invalidate();
        closeAll();
        return;
      }
      await utils.invalidate(['ingredients', 'blockers']);
    },
    onError: (err) => {
      if (isConflictError(err)) onDeleteOtherFkRef();
      setErrors((prev) => ({ ...prev, delete: deriveDeleteError(err, t) }));
    },
  });
}

export function useIngredientActionMutations({ closeAll, onDeleteOtherFkRef }: Args) {
  const { t } = useTranslation('food');
  const utils = usePillarUtils('food');
  const [errors, setErrors] = useState<ErrorState>(EMPTY_ERRORS);

  const clearErrors = useCallback(() => setErrors(EMPTY_ERRORS), []);
  const invalidate = useCallback(async () => {
    await Promise.all([
      utils.invalidate(['ingredients', 'list']),
      utils.invalidate(['ingredients', 'get']),
    ]);
  }, [utils]);

  return {
    errors,
    clearErrors,
    rename: useRenameMutation(invalidate, closeAll, setErrors, t),
    changeParent: useChangeParentMutation(invalidate, closeAll, setErrors, t),
    delete: useDeleteMutation({ invalidate, closeAll, setErrors, onDeleteOtherFkRef, utils, t }),
  };
}
