/**
 * React Query mutations for unit_conversions (PRD-123 Phase D). Each
 * `submit*` returns the underlying mutation's promise so call sites can
 * chain `onSuccess` behaviour (close dialog, etc.) without racing the
 * synchronous-then-stale `errorMessage` state.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FoodApiError, unwrap } from '../../../food-api-helpers.js';
import {
  conversionsCreateUnit,
  conversionsDeleteUnit,
  conversionsUpdateUnit,
} from '../../../food-api/index.js';

import type { TFunction } from 'i18next';

import type { CreateUnitInput, UpdateUnitInput } from './types';

type UpdateUnitMutationInput = UpdateUnitInput & { id: number };
type DeleteUnitMutationInput = { id: number };

function hasStatus(err: unknown, status: number): boolean {
  return err instanceof FoodApiError && err.status === status;
}

function mapMutationError(err: unknown, t: TFunction): string {
  if (hasStatus(err, 409)) return t('data.conversions.units.error.duplicate');
  if (hasStatus(err, 404)) return t('data.conversions.units.error.notFound');
  return t('data.conversions.units.error.generic');
}

type SetError = (msg: string | null) => void;

function useCreateUnit(invalidate: () => void, setErrorMessage: SetError, t: TFunction) {
  return useMutation({
    mutationFn: async (input: CreateUnitInput) =>
      unwrap(await conversionsCreateUnit({ body: input })),
    onSuccess: () => {
      setErrorMessage(null);
      invalidate();
    },
    onError: (err: Error) => setErrorMessage(mapMutationError(err, t)),
  });
}

function useUpdateUnit(invalidate: () => void, setErrorMessage: SetError, t: TFunction) {
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateUnitMutationInput) =>
      unwrap(await conversionsUpdateUnit({ path: { id }, body: patch })),
    onSuccess: () => {
      setErrorMessage(null);
      invalidate();
    },
    onError: (err: Error) => setErrorMessage(mapMutationError(err, t)),
  });
}

function useDeleteUnit(invalidate: () => void, setErrorMessage: SetError, t: TFunction) {
  return useMutation({
    mutationFn: async ({ id }: DeleteUnitMutationInput) =>
      unwrap(await conversionsDeleteUnit({ path: { id } })),
    onSuccess: (result) => {
      if (result.ok) {
        setErrorMessage(null);
        invalidate();
        return;
      }
      setErrorMessage(t('data.conversions.units.error.seeded'));
    },
    onError: (err: Error) => setErrorMessage(mapMutationError(err, t)),
  });
}

export function useUnitMutations() {
  const { t } = useTranslation('food');
  const qc = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['food', 'conversions', 'listUnits'] });
  }, [qc]);

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
