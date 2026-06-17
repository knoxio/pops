import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
/**
 * State + mutation hook for the "+ Add batch" modal.
 *
 * Owns the form state and the `food.batches.create` mutation; the modal
 * component renders the JSX. Splitting like this keeps each function
 * under the `max-lines-per-function` budget.
 */
import { useEffect, useState } from 'react';

import { unwrap } from '../../food-api-helpers.js';
import {
  batchesCreate,
  ingredientsGet,
  ingredientsList,
  prepStatesList,
} from '../../food-api/index.js';
import { toIsoFromDateInput } from './form-controls.js';

import type {
  BatchLocation,
  BatchUnit,
  ManualBatchSourceType,
} from '../../food-api-shared-types.js';
import type { BatchesCreateData } from '../../food-api/types.gen.js';

type BatchesCreateInput = NonNullable<BatchesCreateData['body']>;

export interface AddBatchFormState {
  ingredientId: string;
  variantId: string;
  prepStateId: string;
  qty: string;
  unit: BatchUnit;
  sourceType: ManualBatchSourceType;
  location: BatchLocation;
  producedAt: string;
  expiresAt: string;
  notes: string;
  search: string;
}

interface CreateBatchInput {
  variantId: number;
  prepStateId: number | null;
  qty: number;
  unit: BatchUnit;
  location: BatchLocation;
  sourceType: ManualBatchSourceType;
  producedAt: string | undefined;
  expiresAt: string | undefined;
  notes: string | undefined;
}

function parseCreateInput(form: AddBatchFormState): CreateBatchInput | string {
  const variantId = Number(form.variantId);
  const qty = Number(form.qty);
  if (!Number.isFinite(variantId) || variantId <= 0) return 'Pick an ingredient variant.';
  // Reject zero — a 0-qty batch is hidden from the default fridge view, so
  // creating one would look like the modal silently did nothing.
  if (!Number.isFinite(qty) || qty <= 0) return 'Quantity must be greater than zero.';
  const trimmedNotes = form.notes.trim();
  return {
    variantId,
    prepStateId: form.prepStateId.length > 0 ? Number(form.prepStateId) : null,
    qty,
    unit: form.unit,
    location: form.location,
    sourceType: form.sourceType,
    producedAt: toIsoFromDateInput(form.producedAt),
    expiresAt: toIsoFromDateInput(form.expiresAt),
    notes: trimmedNotes.length > 0 ? trimmedNotes : undefined,
  };
}

export const INITIAL_FORM: AddBatchFormState = {
  ingredientId: '',
  variantId: '',
  prepStateId: '',
  qty: '',
  unit: 'g',
  sourceType: 'purchase',
  location: 'fridge',
  producedAt: '',
  expiresAt: '',
  notes: '',
  search: '',
};

interface UseAddBatchFormArgs {
  isOpen: boolean;
  onAdded: ((batchId: number) => void) | undefined;
  onClose: () => void;
}

function useCreateBatchMutation(args: {
  onAdded: ((batchId: number) => void) | undefined;
  onClose: () => void;
  setError: (msg: string | null) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: BatchesCreateInput) => unwrap(await batchesCreate({ body: input })),
    onSuccess: ({ batchId }) => {
      args.onAdded?.(batchId);
      args.onClose();
    },
    onError: (err: Error) => args.setError(err.message),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['food', 'fridge'] });
    },
  });
}

export function useAddBatchForm({ isOpen, onAdded, onClose }: UseAddBatchFormArgs) {
  const [form, setForm] = useState<AddBatchFormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setForm(INITIAL_FORM);
      setError(null);
    }
  }, [isOpen]);

  const ingredientsSearch = form.search.trim().length > 0 ? form.search.trim() : undefined;
  const ingredientsQuery = useQuery({
    queryKey: ['food', 'ingredients', 'list', { search: ingredientsSearch }],
    queryFn: async () => unwrap(await ingredientsList({ query: { search: ingredientsSearch } })),
    enabled: isOpen,
  });

  const selectedIngredientId = form.ingredientId.length > 0 ? Number(form.ingredientId) : null;

  const ingredientDetail = useQuery({
    queryKey: ['food', 'ingredients', 'get', { idOrSlug: selectedIngredientId ?? 0 }],
    queryFn: async () =>
      unwrap(await ingredientsGet({ path: { idOrSlug: String(selectedIngredientId ?? 0) } })),
    enabled: isOpen && selectedIngredientId !== null,
  });

  const prepStatesQuery = useQuery({
    queryKey: ['food', 'prepStates', 'list'],
    queryFn: async () => unwrap(await prepStatesList()),
    enabled: isOpen,
  });

  const createMutation = useCreateBatchMutation({ onAdded, onClose, setError });

  function submit(): void {
    setError(null);
    const parsed = parseCreateInput(form);
    if (typeof parsed === 'string') {
      setError(parsed);
      return;
    }
    createMutation.mutate(parsed);
  }

  return {
    form,
    setForm,
    error,
    submit,
    isPending: createMutation.isPending,
    ingredients: ingredientsQuery.data?.items ?? [],
    variants: ingredientDetail.data?.variants ?? [],
    prepStates: prepStatesQuery.data?.items ?? [],
  };
}
