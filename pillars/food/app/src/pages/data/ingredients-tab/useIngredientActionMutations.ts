/**
 * The three ingredient-action mutations (rename / changeParent / delete),
 * wrapped so `useIngredientActions` can stay declarative.
 *
 * On delete:
 *   - `{ ok: true }`              → close all dialogs, invalidate caches
 *   - `{ ok: false, blockers }`   → leave the modal open, refetch blockers
 *   - 409 (conflict)             → set `hasOtherFkRefs` so the dialog
 *     surfaces the generic "other refs" copy for FK violations not
 *     enumerated by `getIngredientDeleteBlockers`
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FoodApiError, unwrap } from '../../../food-api-helpers.js';
import {
  ingredientsChangeParent,
  ingredientsDelete,
  ingredientsRename,
} from '../../../food-api/index.js';
import { mapMutationError } from './errors';

import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';

interface RenameInput {
  oldSlug: string;
  newSlug: string;
}
interface ChangeParentInput {
  id: number;
  newParentId: number | null;
}
interface DeleteInput {
  id: number;
}

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

function isConflict(err: unknown): boolean {
  return err instanceof FoodApiError && err.status === 409;
}

function deriveDeleteError(err: unknown, t: TFunction): string {
  if (isConflict(err)) return t('data.ingredients.delete.blockers.otherRefs');
  return mapMutationError(err, t, { fallbackKey: 'data.ingredients.delete.error.generic' });
}

type SetErrors = (updater: (prev: ErrorState) => ErrorState) => void;

function useRenameMutation(
  invalidate: () => Promise<void>,
  closeAll: () => void,
  setErrors: SetErrors,
  t: TFunction
) {
  return useMutation({
    mutationFn: async (input: RenameInput) => unwrap(await ingredientsRename({ body: input })),
    onSuccess: async () => {
      await invalidate();
      closeAll();
    },
    onError: (err: Error) =>
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
  return useMutation({
    mutationFn: async ({ id, newParentId }: ChangeParentInput) =>
      unwrap(await ingredientsChangeParent({ path: { id }, body: { newParentId } })),
    onSuccess: async () => {
      await invalidate();
      closeAll();
    },
    onError: (err: Error) =>
      setErrors((prev) => ({
        ...prev,
        changeParent: mapMutationError(err, t, {
          fallbackKey: 'data.ingredients.changeParent.error.generic',
        }),
      })),
  });
}

interface UseDeleteMutationArgs {
  invalidate: () => Promise<void>;
  closeAll: () => void;
  setErrors: SetErrors;
  onDeleteOtherFkRef: () => void;
  queryClient: QueryClient;
  t: TFunction;
}

function useDeleteMutation({
  invalidate,
  closeAll,
  setErrors,
  onDeleteOtherFkRef,
  queryClient,
  t,
}: UseDeleteMutationArgs) {
  return useMutation({
    mutationFn: async ({ id }: DeleteInput) => unwrap(await ingredientsDelete({ path: { id } })),
    onSuccess: async (result) => {
      if (result.ok) {
        await invalidate();
        closeAll();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['food', 'ingredients', 'blockers'] });
    },
    onError: (err: Error) => {
      if (isConflict(err)) onDeleteOtherFkRef();
      setErrors((prev) => ({ ...prev, delete: deriveDeleteError(err, t) }));
    },
  });
}

export function useIngredientActionMutations({ closeAll, onDeleteOtherFkRef }: Args) {
  const { t } = useTranslation('food');
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<ErrorState>(EMPTY_ERRORS);

  const clearErrors = useCallback(() => setErrors(EMPTY_ERRORS), []);
  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['food', 'ingredients', 'list'] }),
      queryClient.invalidateQueries({ queryKey: ['food', 'ingredients', 'get'] }),
    ]);
  }, [queryClient]);

  return {
    errors,
    clearErrors,
    rename: useRenameMutation(invalidate, closeAll, setErrors, t),
    changeParent: useChangeParentMutation(invalidate, closeAll, setErrors, t),
    delete: useDeleteMutation({
      invalidate,
      closeAll,
      setErrors,
      onDeleteOtherFkRef,
      queryClient,
      t,
    }),
  };
}
