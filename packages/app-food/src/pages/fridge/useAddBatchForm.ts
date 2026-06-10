/**
 * State + mutation hook for the "+ Add batch" modal.
 *
 * Owns the form state and the `food.batches.create` mutation; the modal
 * component renders the JSX. Splitting like this keeps each function
 * under the `max-lines-per-function` budget.
 */
import { useEffect, useState } from 'react';

import { trpc } from '@pops/api-client';

import { toIsoFromDateInput } from './form-controls.js';

import type { BatchLocation, BatchUnit, ManualBatchSourceType } from '@pops/app-food-db';

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

export function useAddBatchForm({ isOpen, onAdded, onClose }: UseAddBatchFormArgs) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState<AddBatchFormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setForm(INITIAL_FORM);
      setError(null);
    }
  }, [isOpen]);

  const ingredientsQuery = trpc.food.ingredients.list.useQuery(
    { search: form.search.trim().length > 0 ? form.search.trim() : undefined },
    { enabled: isOpen }
  );

  const selectedIngredientId = form.ingredientId.length > 0 ? Number(form.ingredientId) : null;

  const ingredientDetail = trpc.food.ingredients.get.useQuery(
    { idOrSlug: selectedIngredientId ?? 0 },
    { enabled: isOpen && selectedIngredientId !== null }
  );

  const prepStatesQuery = trpc.food.prepStates.list.useQuery(undefined, { enabled: isOpen });

  const createMutation = trpc.food.batches.create.useMutation({
    onSuccess: ({ batchId }) => {
      void utils.food.fridge.view.invalidate();
      onAdded?.(batchId);
      onClose();
    },
    onError: (err) => setError(err.message),
  });

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
