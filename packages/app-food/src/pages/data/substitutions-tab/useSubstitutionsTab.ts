import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { unwrap } from '../../../food-api-helpers.js';
import {
  substitutionsCreate,
  substitutionsDelete,
  substitutionsListHydrated,
  substitutionsUpdate,
} from '../../../food-api/index.js';

import { mapMutationError } from './mapSubstitutionsError';
import {
  EMPTY_FILTERS,
  type CreateSubstitutionFormInput,
  type SubstitutionsFilterState,
  type UpdateSubstitutionFormInput,
} from './types';

import type { SubstitutionsCreateData } from '../../../food-api/types.gen.js';

type CreatePayload = NonNullable<SubstitutionsCreateData['body']>;

interface UpdatePayload {
  id: number;
  ratio?: number;
  contextTags?: string[];
}

const LIST_KEY = ['food', 'substitutions', 'listHydrated'] as const;

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

function toCreatePayload(input: CreateSubstitutionFormInput): CreatePayload {
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

function toUpdatePayload(input: UpdateSubstitutionFormInput): UpdatePayload {
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
  const createMutation = useMutation({
    mutationFn: async (payload: CreatePayload) =>
      unwrap(await substitutionsCreate({ body: payload })),
    onSuccess: () => {
      setCreateError(null);
      invalidate();
    },
    onError: (err: Error) => setCreateError(mapMutationError(err, t)),
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, ratio, contextTags }: UpdatePayload) =>
      unwrap(await substitutionsUpdate({ path: { id }, body: { ratio, contextTags } })),
    onSuccess: () => {
      setRowError(null);
      invalidate();
    },
    onError: (err: Error) => setRowError(mapMutationError(err, t)),
  });
  const deleteMutation = useMutation({
    mutationFn: async ({ id }: { id: number }) =>
      unwrap(await substitutionsDelete({ path: { id } })),
    onSuccess: () => {
      setRowError(null);
      invalidate();
    },
    onError: (err: Error) => setRowError(mapMutationError(err, t)),
  });
  return { createMutation, updateMutation, deleteMutation };
}

export function useSubstitutionsTab() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<SubstitutionsFilterState>(EMPTY_FILTERS);
  const [createError, setCreateError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const listInput = useMemo(() => buildListInput(filters), [filters]);
  const listQuery = useQuery({
    queryKey: [...LIST_KEY, listInput],
    queryFn: async () => unwrap(await substitutionsListHydrated({ query: listInput })),
  });

  const invalidate = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: LIST_KEY }),
    [queryClient]
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
