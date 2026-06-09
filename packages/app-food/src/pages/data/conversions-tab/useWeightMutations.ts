/**
 * tRPC mutations for ingredient_weights. Same shape as `useUnitMutations`;
 * separate hook so each section owns its own error state. Each `submit*`
 * accepts an optional `onSuccess` callback the call site can use to close
 * its dialog AFTER the server confirms (avoids the synchronous-state
 * race where the dialog would close on every submit regardless of outcome).
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

  const submitCreate = useCallback(
    (input: CreateWeightInput, onSuccess?: () => void) =>
      create.mutate(input, { onSuccess: () => onSuccess?.() }),
    [create]
  );
  const submitUpdate = useCallback(
    (id: number, patch: UpdateWeightInput, onSuccess?: () => void) =>
      update.mutate({ id, ...patch }, { onSuccess: () => onSuccess?.() }),
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
