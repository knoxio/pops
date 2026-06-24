/**
 * React Query mutations for ingredient_weights. Same shape as
 * `useUnitMutations`; separate hook so each section owns its own error
 * state. Each `submit*` accepts an optional `onSuccess` the call site uses
 * to close its dialog AFTER the server confirms (avoids the
 * synchronous-state race where the dialog would close on every submit
 * regardless of outcome).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FoodApiError, unwrap } from '../../../food-api-helpers.js';
import {
  conversionsCreateWeight,
  conversionsDeleteWeight,
  conversionsUpdateWeight,
} from '../../../food-api/index.js';

import type { TFunction } from 'i18next';

import type { CreateWeightInput, UpdateWeightInput } from './types';

type UpdateWeightMutationInput = UpdateWeightInput & { id: number };
type DeleteWeightMutationInput = { id: number };

function hasStatus(err: unknown, status: number): boolean {
  return err instanceof FoodApiError && err.status === status;
}

function mapMutationError(err: unknown, t: TFunction): string {
  if (hasStatus(err, 409)) return t('data.conversions.weights.error.duplicate');
  if (hasStatus(err, 404)) return t('data.conversions.weights.error.notFound');
  if (hasStatus(err, 400)) return t('data.conversions.weights.error.invalid');
  return t('data.conversions.weights.error.generic');
}

type SetError = (msg: string | null) => void;

function useCreateWeight(invalidate: () => void, setErrorMessage: SetError, t: TFunction) {
  return useMutation({
    mutationFn: async (input: CreateWeightInput) =>
      unwrap(await conversionsCreateWeight({ body: input })),
    onSuccess: () => {
      setErrorMessage(null);
      invalidate();
    },
    onError: (err: Error) => setErrorMessage(mapMutationError(err, t)),
  });
}

function useUpdateWeight(invalidate: () => void, setErrorMessage: SetError, t: TFunction) {
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateWeightMutationInput) =>
      unwrap(await conversionsUpdateWeight({ path: { id }, body: patch })),
    onSuccess: () => {
      setErrorMessage(null);
      invalidate();
    },
    onError: (err: Error) => setErrorMessage(mapMutationError(err, t)),
  });
}

function useDeleteWeight(invalidate: () => void, setErrorMessage: SetError, t: TFunction) {
  return useMutation({
    mutationFn: async ({ id }: DeleteWeightMutationInput) =>
      unwrap(await conversionsDeleteWeight({ path: { id } })),
    onSuccess: (result) => {
      if (result.ok) {
        setErrorMessage(null);
        invalidate();
        return;
      }
      setErrorMessage(t('data.conversions.weights.error.seeded'));
    },
    onError: (err: Error) => setErrorMessage(mapMutationError(err, t)),
  });
}

export function useWeightMutations() {
  const { t } = useTranslation('food');
  const qc = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['food', 'conversions', 'listWeights'] });
  }, [qc]);

  const create = useCreateWeight(invalidate, setErrorMessage, t);
  const update = useUpdateWeight(invalidate, setErrorMessage, t);
  const remove = useDeleteWeight(invalidate, setErrorMessage, t);

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
