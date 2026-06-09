/**
 * tRPC mutations for ingredient_weights. Same shape as `useUnitMutations`;
 * separate hook so each section owns its own error state.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { trpc } from '@pops/api-client';

import type { TFunction } from 'i18next';

import type { CreateWeightInput, UpdateWeightInput } from './types';

function mapMutationError(
  err: { data?: { code?: string } | null; message: string },
  t: TFunction
): string {
  const code = err.data?.code;
  if (code === 'CONFLICT') return t('data.conversions.weights.error.duplicate');
  if (code === 'NOT_FOUND') return t('data.conversions.weights.error.notFound');
  if (code === 'BAD_REQUEST') return t('data.conversions.weights.error.invalid');
  return t('data.conversions.weights.error.generic');
}

export function useWeightMutations() {
  const { t } = useTranslation('food');
  const utils = trpc.useUtils();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const invalidate = useCallback(() => {
    void utils.food.conversions.listWeights.invalidate();
  }, [utils]);

  const create = trpc.food.conversions.createWeight.useMutation({
    onSuccess: () => {
      setErrorMessage(null);
      invalidate();
    },
    onError: (err) => setErrorMessage(mapMutationError(err, t)),
  });

  const update = trpc.food.conversions.updateWeight.useMutation({
    onSuccess: () => {
      setErrorMessage(null);
      invalidate();
    },
    onError: (err) => setErrorMessage(mapMutationError(err, t)),
  });

  const remove = trpc.food.conversions.deleteWeight.useMutation({
    onSuccess: (result) => {
      if (result.ok) {
        setErrorMessage(null);
        invalidate();
        return;
      }
      setErrorMessage(t('data.conversions.weights.error.seeded'));
    },
    onError: (err) => setErrorMessage(mapMutationError(err, t)),
  });

  const clearError = useCallback(() => setErrorMessage(null), []);

  const submitCreate = useCallback((input: CreateWeightInput) => create.mutate(input), [create]);
  const submitUpdate = useCallback(
    (id: number, patch: UpdateWeightInput) => update.mutate({ id, ...patch }),
    [update]
  );
  const submitDelete = useCallback((id: number) => remove.mutate({ id }), [remove]);

  return {
    errorMessage,
    isCreating: create.isPending,
    isUpdating: update.isPending,
    isDeleting: remove.isPending,
    clearError,
    submitCreate,
    submitUpdate,
    submitDelete,
  };
}
