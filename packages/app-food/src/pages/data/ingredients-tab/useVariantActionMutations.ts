/**
 * The four variant-action mutations (create / update / delete) and the
 * shared error mapping. Split out from `useVariantActions` so that hook
 * stays under the per-function lint cap.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FoodApiError, unwrap } from '../../../food-api-helpers.js';
import { variantsCreate, variantsDelete, variantsUpdate } from '../../../food-api/index.js';
import { mapVariantMutationError } from './errors';

import type { VariantsCreateData, VariantsUpdateData } from '../../../food-api/types.gen.js';
import type { VariantFormValues } from './variant-form-helpers';

type CreateVariantInput = NonNullable<VariantsCreateData['body']>;
type UpdateBody = NonNullable<VariantsUpdateData['body']>;
type UpdateVariantInput = VariantFormValues & { id: number };
interface DeleteVariantInput {
  id: number;
}

interface Args {
  onFormSuccess: () => void;
  onDeleteSuccess: () => void;
}

function isConflict(err: unknown): boolean {
  return err instanceof FoodApiError && err.status === 409;
}

export function useVariantActionMutations({ onFormSuccess, onDeleteSuccess }: Args) {
  const { t } = useTranslation('food');
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['food', 'ingredients', 'get'] }),
    [queryClient]
  );
  const create = useMutation({
    mutationFn: async (input: CreateVariantInput) => unwrap(await variantsCreate({ body: input })),
    onSuccess: async () => {
      await invalidate();
      onFormSuccess();
    },
    onError: (err: Error) => setFormError(mapVariantMutationError(err, t)),
  });
  const update = useMutation({
    mutationFn: async ({ id, slug, name, defaultUnit, packageSizeG, notes }: UpdateVariantInput) => {
      const body: UpdateBody = { slug, name, defaultUnit, packageSizeG, notes };
      return unwrap(await variantsUpdate({ path: { id }, body }));
    },
    onSuccess: async () => {
      await invalidate();
      onFormSuccess();
    },
    onError: (err: Error) => setFormError(mapVariantMutationError(err, t)),
  });
  const deleteMutation = useMutation({
    mutationFn: async ({ id }: DeleteVariantInput) => unwrap(await variantsDelete({ path: { id } })),
    onSuccess: async () => {
      await invalidate();
      onDeleteSuccess();
    },
    onError: (err: Error) => {
      if (isConflict(err)) {
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
