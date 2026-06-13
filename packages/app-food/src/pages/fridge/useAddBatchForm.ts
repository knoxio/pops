/**
 * State + mutation hook for the "+ Add batch" modal.
 *
 * Owns the form state and the `food.batches.create` mutation; the modal
 * component renders the JSX. Splitting like this keeps each function
 * under the `max-lines-per-function` budget.
 */
import { useEffect, useState } from 'react';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

import { toIsoFromDateInput } from './form-controls.js';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';
import type { BatchLocation, BatchUnit, ManualBatchSourceType } from '@pops/app-food-db';

type IngredientsListOutput = inferRouterOutputs<AppRouter>['food']['ingredients']['list'];
type IngredientsGetOutput = inferRouterOutputs<AppRouter>['food']['ingredients']['get'];
type PrepStatesListOutput = inferRouterOutputs<AppRouter>['food']['prepStates']['list'];
type BatchesCreateInput = inferRouterInputs<AppRouter>['food']['batches']['create'];
type BatchesCreateOutput = inferRouterOutputs<AppRouter>['food']['batches']['create'];

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
  const utils = usePillarUtils('food');
  return usePillarMutation<BatchesCreateInput, BatchesCreateOutput>('food', ['batches', 'create'], {
    onSuccess: ({ batchId }) => {
      void utils.invalidate(['fridge', 'view']);
      args.onAdded?.(batchId);
      args.onClose();
    },
    onError: (err) => args.setError(err.message),
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

  const ingredientsQuery = usePillarQuery<IngredientsListOutput>(
    'food',
    ['ingredients', 'list'],
    { search: form.search.trim().length > 0 ? form.search.trim() : undefined },
    { enabled: isOpen }
  );

  const selectedIngredientId = form.ingredientId.length > 0 ? Number(form.ingredientId) : null;

  const ingredientDetail = usePillarQuery<IngredientsGetOutput>(
    'food',
    ['ingredients', 'get'],
    { idOrSlug: selectedIngredientId ?? 0 },
    { enabled: isOpen && selectedIngredientId !== null }
  );

  const prepStatesQuery = usePillarQuery<PrepStatesListOutput>(
    'food',
    ['prepStates', 'list'],
    undefined,
    { enabled: isOpen }
  );

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
