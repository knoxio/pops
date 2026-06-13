/**
 * The four variant-action tRPC mutations (create / update / delete) and the
 * shared error mapping. Split out from `useVariantActions` so that hook
 * stays under the per-function lint cap.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isConflict } from '@pops/pillar-sdk/client';
import { usePillarMutation, usePillarUtils } from '@pops/pillar-sdk/react';

import { mapVariantMutationError } from './errors';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';

type CreateVariantInput = inferRouterInputs<AppRouter>['food']['variants']['create'];
type CreateVariantOutput = inferRouterOutputs<AppRouter>['food']['variants']['create'];
type UpdateVariantInput = inferRouterInputs<AppRouter>['food']['variants']['update'];
type UpdateVariantOutput = inferRouterOutputs<AppRouter>['food']['variants']['update'];
type DeleteVariantInput = inferRouterInputs<AppRouter>['food']['variants']['delete'];
type DeleteVariantOutput = inferRouterOutputs<AppRouter>['food']['variants']['delete'];

interface Args {
  onFormSuccess: () => void;
  onDeleteSuccess: () => void;
}

export function useVariantActionMutations({ onFormSuccess, onDeleteSuccess }: Args) {
  const { t } = useTranslation('food');
  const utils = usePillarUtils('food');
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const invalidate = useCallback(() => utils.invalidate(['ingredients', 'get']), [utils]);
  const create = usePillarMutation<CreateVariantInput, CreateVariantOutput>(
    'food',
    ['variants', 'create'],
    {
      onSuccess: async () => {
        await invalidate();
        onFormSuccess();
      },
      onError: (err) => setFormError(mapVariantMutationError(err, t)),
    }
  );
  const update = usePillarMutation<UpdateVariantInput, UpdateVariantOutput>(
    'food',
    ['variants', 'update'],
    {
      onSuccess: async () => {
        await invalidate();
        onFormSuccess();
      },
      onError: (err) => setFormError(mapVariantMutationError(err, t)),
    }
  );
  const deleteMutation = usePillarMutation<DeleteVariantInput, DeleteVariantOutput>(
    'food',
    ['variants', 'delete'],
    {
      onSuccess: async () => {
        await invalidate();
        onDeleteSuccess();
      },
      onError: (err) => {
        if (isConflict(err)) {
          setDeleteError(t('data.ingredients.variants.delete.referenced'));
          return;
        }
        setDeleteError(t('data.ingredients.variants.error.generic'));
      },
    }
  );

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
