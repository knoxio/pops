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

import { trpc } from '@pops/api-client';

import { mapMutationError } from './errors';

import type { TFunction } from 'i18next';

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

function deriveDeleteError(
  err: { data?: { code?: string } | null; message: string },
  t: TFunction
): string {
  if (err.data?.code === 'CONFLICT') return t('data.ingredients.delete.blockers.otherRefs');
  return mapMutationError(err, t, { fallbackKey: 'data.ingredients.delete.error.generic' });
}

export function useIngredientActionMutations({ closeAll, onDeleteOtherFkRef }: Args) {
  const { t } = useTranslation('food');
  const utils = trpc.useUtils();
  const [errors, setErrors] = useState<ErrorState>(EMPTY_ERRORS);

  const clearErrors = useCallback(() => setErrors(EMPTY_ERRORS), []);
  const invalidate = useCallback(async () => {
    await Promise.all([
      utils.food.ingredients.list.invalidate(),
      utils.food.ingredients.get.invalidate(),
    ]);
  }, [utils]);

  const rename = trpc.food.ingredients.rename.useMutation({
    onSuccess: async () => {
      await invalidate();
      closeAll();
    },
    onError: (err) =>
      setErrors((prev) => ({
        ...prev,
        rename: mapMutationError(err, t, { fallbackKey: 'data.ingredients.create.error.generic' }),
      })),
  });
  const changeParent = trpc.food.ingredients.changeParent.useMutation({
    onSuccess: async () => {
      await invalidate();
      closeAll();
    },
    onError: (err) =>
      setErrors((prev) => ({
        ...prev,
        changeParent: mapMutationError(err, t, {
          fallbackKey: 'data.ingredients.create.error.generic',
        }),
      })),
  });
  const deleteMutation = trpc.food.ingredients.delete.useMutation({
    onSuccess: async (result) => {
      if (result.ok) {
        await invalidate();
        closeAll();
        return;
      }
      await utils.food.ingredients.blockers.invalidate();
    },
    onError: (err) => {
      if (err.data?.code === 'CONFLICT') onDeleteOtherFkRef();
      setErrors((prev) => ({ ...prev, delete: deriveDeleteError(err, t) }));
    },
  });

  return {
    errors,
    clearErrors,
    rename,
    changeParent,
    delete: deleteMutation,
  };
}
