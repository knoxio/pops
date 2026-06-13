/**
 * tRPC mutations for unit_conversions. Each `submit*` returns the
 * underlying mutation's promise so call sites can chain `onSuccess`
 * behaviour (close dialog, etc.) without racing the synchronous-then-
 * stale `errorMessage` state.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePillarMutation, usePillarUtils } from '@pops/pillar-sdk/react';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { TFunction } from 'i18next';

import type { AppRouter } from '@pops/api-client';

import type { CreateUnitInput, UpdateUnitInput } from './types';

type CreateUnitMutationInput = inferRouterInputs<AppRouter>['food']['conversions']['createUnit'];
type CreateUnitMutationOutput = inferRouterOutputs<AppRouter>['food']['conversions']['createUnit'];
type UpdateUnitMutationInput = inferRouterInputs<AppRouter>['food']['conversions']['updateUnit'];
type UpdateUnitMutationOutput = inferRouterOutputs<AppRouter>['food']['conversions']['updateUnit'];
type DeleteUnitMutationInput = inferRouterInputs<AppRouter>['food']['conversions']['deleteUnit'];
type DeleteUnitMutationOutput = inferRouterOutputs<AppRouter>['food']['conversions']['deleteUnit'];

function mapMutationError(
  err: { data?: { code?: string } | null; message: string },
  t: TFunction
): string {
  const code = err.data?.code;
  if (code === 'CONFLICT') return t('data.conversions.units.error.duplicate');
  if (code === 'NOT_FOUND') return t('data.conversions.units.error.notFound');
  return t('data.conversions.units.error.generic');
}

type SetError = (msg: string | null) => void;

function useCreateUnit(invalidate: () => void, setErrorMessage: SetError, t: TFunction) {
  return usePillarMutation<CreateUnitMutationInput, CreateUnitMutationOutput>(
    'food',
    ['conversions', 'createUnit'],
    {
      onSuccess: () => {
        setErrorMessage(null);
        invalidate();
      },
      onError: (err) => setErrorMessage(mapMutationError(err, t)),
    }
  );
}

function useUpdateUnit(invalidate: () => void, setErrorMessage: SetError, t: TFunction) {
  return usePillarMutation<UpdateUnitMutationInput, UpdateUnitMutationOutput>(
    'food',
    ['conversions', 'updateUnit'],
    {
      onSuccess: () => {
        setErrorMessage(null);
        invalidate();
      },
      onError: (err) => setErrorMessage(mapMutationError(err, t)),
    }
  );
}

function useDeleteUnit(invalidate: () => void, setErrorMessage: SetError, t: TFunction) {
  return usePillarMutation<DeleteUnitMutationInput, DeleteUnitMutationOutput>(
    'food',
    ['conversions', 'deleteUnit'],
    {
      onSuccess: (result) => {
        if (result.ok) {
          setErrorMessage(null);
          invalidate();
          return;
        }
        setErrorMessage(t('data.conversions.units.error.seeded'));
      },
      onError: (err) => setErrorMessage(mapMutationError(err, t)),
    }
  );
}

export function useUnitMutations() {
  const { t } = useTranslation('food');
  const utils = usePillarUtils('food');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const invalidate = useCallback(() => {
    void utils.invalidate(['conversions', 'listUnits']);
  }, [utils]);

  const create = useCreateUnit(invalidate, setErrorMessage, t);
  const update = useUpdateUnit(invalidate, setErrorMessage, t);
  const remove = useDeleteUnit(invalidate, setErrorMessage, t);

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
