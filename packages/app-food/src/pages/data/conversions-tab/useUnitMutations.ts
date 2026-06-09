/**
 * tRPC mutations for unit_conversions. Each `submit*` returns the
 * underlying mutation's promise so call sites can chain `onSuccess`
 * behaviour (close dialog, etc.) without racing the synchronous-then-
 * stale `errorMessage` state.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { trpc } from '@pops/api-client';

import type { TFunction } from 'i18next';

import type { CreateUnitInput, UpdateUnitInput } from './types';

function mapMutationError(
  err: { data?: { code?: string } | null; message: string },
  t: TFunction
): string {
  const code = err.data?.code;
  if (code === 'CONFLICT') return t('data.conversions.units.error.duplicate');
  if (code === 'NOT_FOUND') return t('data.conversions.units.error.notFound');
  return t('data.conversions.units.error.generic');
}

export function useUnitMutations() {
  const { t } = useTranslation('food');
  const utils = trpc.useUtils();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const invalidate = useCallback(() => {
    void utils.food.conversions.listUnits.invalidate();
  }, [utils]);

  const create = trpc.food.conversions.createUnit.useMutation({
    onSuccess: () => {
      setErrorMessage(null);
      invalidate();
    },
    onError: (err) => setErrorMessage(mapMutationError(err, t)),
  });

  const update = trpc.food.conversions.updateUnit.useMutation({
    onSuccess: () => {
      setErrorMessage(null);
      invalidate();
    },
    onError: (err) => setErrorMessage(mapMutationError(err, t)),
  });

  const remove = trpc.food.conversions.deleteUnit.useMutation({
    onSuccess: (result) => {
      if (result.ok) {
        setErrorMessage(null);
        invalidate();
        return;
      }
      setErrorMessage(t('data.conversions.units.error.seeded'));
    },
    onError: (err) => setErrorMessage(mapMutationError(err, t)),
  });

  const clearError = useCallback(() => setErrorMessage(null), []);

  const submitCreate = useCallback(
    (input: CreateUnitInput, onSuccess?: () => void) =>
      create.mutate(input, { onSuccess: () => onSuccess?.() }),
    [create]
  );
  const submitUpdate = useCallback(
    (id: number, patch: UpdateUnitInput, onSuccess?: () => void) =>
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
