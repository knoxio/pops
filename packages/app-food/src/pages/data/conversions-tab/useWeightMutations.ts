/**
 * tRPC mutations for ingredient_weights. Same shape as `useUnitMutations`;
 * separate hook so each section owns its own error state. Each `submit*`
 * accepts an optional `onSuccess` callback the call site can use to close
 * its dialog AFTER the server confirms (avoids the synchronous-state
 * race where the dialog would close on every submit regardless of outcome).
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isBadRequest, isConflict, isNotFound } from '@pops/pillar-sdk/client';
import { usePillarMutation, usePillarUtils } from '@pops/pillar-sdk/react';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { TFunction } from 'i18next';

import type { AppRouter } from '@pops/api';

import type { CreateWeightInput, UpdateWeightInput } from './types';

type CreateWeightMutationInput =
  inferRouterInputs<AppRouter>['food']['conversions']['createWeight'];
type CreateWeightMutationOutput =
  inferRouterOutputs<AppRouter>['food']['conversions']['createWeight'];
type UpdateWeightMutationInput =
  inferRouterInputs<AppRouter>['food']['conversions']['updateWeight'];
type UpdateWeightMutationOutput =
  inferRouterOutputs<AppRouter>['food']['conversions']['updateWeight'];
type DeleteWeightMutationInput =
  inferRouterInputs<AppRouter>['food']['conversions']['deleteWeight'];
type DeleteWeightMutationOutput =
  inferRouterOutputs<AppRouter>['food']['conversions']['deleteWeight'];

function mapMutationError(err: unknown, t: TFunction): string {
  if (isConflict(err)) return t('data.conversions.weights.error.duplicate');
  if (isNotFound(err)) return t('data.conversions.weights.error.notFound');
  if (isBadRequest(err)) return t('data.conversions.weights.error.invalid');
  return t('data.conversions.weights.error.generic');
}

type SetError = (msg: string | null) => void;

function useCreateWeight(invalidate: () => void, setErrorMessage: SetError, t: TFunction) {
  return usePillarMutation<CreateWeightMutationInput, CreateWeightMutationOutput>(
    'food',
    ['conversions', 'createWeight'],
    {
      onSuccess: () => {
        setErrorMessage(null);
        invalidate();
      },
      onError: (err) => setErrorMessage(mapMutationError(err, t)),
    }
  );
}

function useUpdateWeight(invalidate: () => void, setErrorMessage: SetError, t: TFunction) {
  return usePillarMutation<UpdateWeightMutationInput, UpdateWeightMutationOutput>(
    'food',
    ['conversions', 'updateWeight'],
    {
      onSuccess: () => {
        setErrorMessage(null);
        invalidate();
      },
      onError: (err) => setErrorMessage(mapMutationError(err, t)),
    }
  );
}

function useDeleteWeight(invalidate: () => void, setErrorMessage: SetError, t: TFunction) {
  return usePillarMutation<DeleteWeightMutationInput, DeleteWeightMutationOutput>(
    'food',
    ['conversions', 'deleteWeight'],
    {
      onSuccess: (result) => {
        if (result.ok) {
          setErrorMessage(null);
          invalidate();
          return;
        }
        setErrorMessage(t('data.conversions.weights.error.seeded'));
      },
      onError: (err) => setErrorMessage(mapMutationError(err, t)),
    }
  );
}

export function useWeightMutations() {
  const { t } = useTranslation('food');
  const utils = usePillarUtils('food');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const invalidate = useCallback(() => {
    void utils.invalidate(['conversions', 'listWeights']);
  }, [utils]);

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
