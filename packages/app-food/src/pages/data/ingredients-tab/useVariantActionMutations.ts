/**
 * The four variant-action tRPC mutations (create / update / delete) and the
 * shared error mapping. Split out from `useVariantActions` so that hook
 * stays under the per-function lint cap.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { trpc } from '@pops/api-client';

import { mapVariantMutationError } from './errors';

interface Args {
  onFormSuccess: () => void;
  onDeleteSuccess: () => void;
}

export function useVariantActionMutations({ onFormSuccess, onDeleteSuccess }: Args) {
  const { t } = useTranslation('food');
  const utils = trpc.useUtils();
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const invalidate = useCallback(() => utils.food.ingredients.get.invalidate(), [utils]);
  const create = trpc.food.variants.create.useMutation({
    onSuccess: async () => {
      await invalidate();
      onFormSuccess();
    },
    onError: (err) => setFormError(mapVariantMutationError(err, t)),
  });
  const update = trpc.food.variants.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      onFormSuccess();
    },
    onError: (err) => setFormError(mapVariantMutationError(err, t)),
  });
  const deleteMutation = trpc.food.variants.delete.useMutation({
    onSuccess: async () => {
      await invalidate();
      onDeleteSuccess();
    },
    onError: (err) => {
      if (err.data?.code === 'CONFLICT') {
        setDeleteError(t('data.ingredients.variants.delete.referenced'));
        return;
      }
      setDeleteError(t('data.ingredients.variants.error.generic'));
    },
  });

  return {
    formError,
    deleteError,
    clearFormError: () => setFormError(null),
    clearDeleteError: () => setDeleteError(null),
    create,
    update,
    delete: deleteMutation,
  };
}
