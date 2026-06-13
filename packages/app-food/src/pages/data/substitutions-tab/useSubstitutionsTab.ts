import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

import { mapMutationError } from './mapSubstitutionsError';
import {
  EMPTY_FILTERS,
  type CreateSubstitutionFormInput,
  type SubstitutionsFilterState,
  type UpdateSubstitutionFormInput,
} from './types';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';

type ListHydratedOutput = inferRouterOutputs<AppRouter>['food']['substitutions']['listHydrated'];
type CreateInput = inferRouterInputs<AppRouter>['food']['substitutions']['create'];
type CreateOutput = inferRouterOutputs<AppRouter>['food']['substitutions']['create'];
type UpdateInput = inferRouterInputs<AppRouter>['food']['substitutions']['update'];
type UpdateOutput = inferRouterOutputs<AppRouter>['food']['substitutions']['update'];
type DeleteInput = inferRouterInputs<AppRouter>['food']['substitutions']['delete'];
type DeleteOutput = inferRouterOutputs<AppRouter>['food']['substitutions']['delete'];

function buildListInput(filters: SubstitutionsFilterState) {
  return {
    fromIngredientId: filters.fromIngredientId ?? undefined,
    fromVariantId: filters.fromVariantId ?? undefined,
    toIngredientId: filters.toIngredientId ?? undefined,
    toVariantId: filters.toVariantId ?? undefined,
    scope: filters.scope ?? undefined,
    recipeId: filters.recipeId ?? undefined,
    contextTag: filters.contextTag.trim().length > 0 ? filters.contextTag.trim() : undefined,
  };
}

function toCreatePayload(input: CreateSubstitutionFormInput) {
  return {
    from: endpointPayload(input.from.kind, input.from.id),
    to: endpointPayload(input.to.kind, input.to.id),
    ratio: input.ratio,
    scope: input.scope,
    recipeId: input.scope === 'recipe' ? input.recipeId : undefined,
    contextTags: [...input.contextTags],
    notes: input.notes,
  };
}

function toUpdatePayload(input: UpdateSubstitutionFormInput) {
  return {
    id: input.id,
    ratio: input.ratio,
    contextTags: input.contextTags === undefined ? undefined : [...input.contextTags],
  };
}

function endpointPayload(kind: 'ingredient' | 'variant', id: number) {
  return kind === 'ingredient' ? { ingredientId: id } : { variantId: id };
}

function useSubstitutionMutations(
  invalidate: () => void,
  setCreateError: (msg: string | null) => void,
  setRowError: (msg: string | null) => void
) {
  const { t } = useTranslation('food');
  const createMutation = usePillarMutation<CreateInput, CreateOutput>(
    'food',
    ['substitutions', 'create'],
    {
      onSuccess: () => {
        setCreateError(null);
        invalidate();
      },
      onError: (err) => setCreateError(mapMutationError(err, t)),
    }
  );
  const updateMutation = usePillarMutation<UpdateInput, UpdateOutput>(
    'food',
    ['substitutions', 'update'],
    {
      onSuccess: () => {
        setRowError(null);
        invalidate();
      },
      onError: (err) => setRowError(mapMutationError(err, t)),
    }
  );
  const deleteMutation = usePillarMutation<DeleteInput, DeleteOutput>(
    'food',
    ['substitutions', 'delete'],
    {
      onSuccess: () => {
        setRowError(null);
        invalidate();
      },
      onError: (err) => setRowError(mapMutationError(err, t)),
    }
  );
  return { createMutation, updateMutation, deleteMutation };
}

export function useSubstitutionsTab() {
  const utils = usePillarUtils('food');
  const [filters, setFilters] = useState<SubstitutionsFilterState>(EMPTY_FILTERS);
  const [createError, setCreateError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const listInput = useMemo(() => buildListInput(filters), [filters]);
  const listQuery = usePillarQuery<ListHydratedOutput>(
    'food',
    ['substitutions', 'listHydrated'],
    listInput
  );

  const invalidate = useCallback(
    () => void utils.invalidate(['substitutions', 'listHydrated']),
    [utils]
  );

  const { createMutation, updateMutation, deleteMutation } = useSubstitutionMutations(
    invalidate,
    setCreateError,
    setRowError
  );

  const submitCreate = useCallback(
    (input: CreateSubstitutionFormInput) => {
      setCreateError(null);
      createMutation.mutate(toCreatePayload(input));
    },
    [createMutation]
  );

  const submitUpdate = useCallback(
    (input: UpdateSubstitutionFormInput) => {
      setRowError(null);
      updateMutation.mutate(toUpdatePayload(input));
    },
    [updateMutation]
  );

  const submitDelete = useCallback(
    (id: number) => {
      setRowError(null);
      deleteMutation.mutate({ id });
    },
    [deleteMutation]
  );

  const resetFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  return {
    filters,
    setFilters,
    resetFilters,
    rows: listQuery.data?.items ?? [],
    isLoading: listQuery.isLoading,
    createError,
    rowError,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    submitCreate,
    submitUpdate,
    submitDelete,
    clearRowError: () => setRowError(null),
    clearCreateError: () => setCreateError(null),
  };
}
