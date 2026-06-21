import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
/**
 * State + mutation hook for `EditBatchModal` — keeps the React
 * component thin enough to satisfy the `max-lines-per-function` lint
 * rule.
 */
import { useEffect, useState } from 'react';

import { unwrap } from '../../food-api-helpers.js';
import { batchesEdit, batchesGet, prepStatesList } from '../../food-api/index.js';

import type { BatchesEditData } from '../../food-api/types.gen.js';

type BatchesEditInput = NonNullable<BatchesEditData['body']> & { id: number };

export interface EditState {
  expiresAt: string;
  notes: string;
  prepStateId: string;
}

const EMPTY_STATE: EditState = { expiresAt: '', notes: '', prepStateId: '' };

interface UseEditBatchArgs {
  batchId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export function useEditBatchState({ batchId, isOpen, onClose }: UseEditBatchArgs) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['food', 'batches', 'get', { id: batchId ?? 0 }],
    queryFn: async () => unwrap(await batchesGet({ path: { id: batchId ?? 0 } })).data,
    enabled: isOpen && batchId !== null,
  });
  const prepStates = useQuery({
    queryKey: ['food', 'prepStates', 'list'],
    queryFn: async () => unwrap(await prepStatesList()),
    enabled: isOpen,
  });
  const [form, setForm] = useState<EditState>(EMPTY_STATE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (detail.data !== null && detail.data !== undefined) {
      setForm({
        expiresAt: detail.data.expiresAt !== null ? detail.data.expiresAt.slice(0, 10) : '',
        notes: detail.data.notes ?? '',
        prepStateId: detail.data.prepStateId !== null ? String(detail.data.prepStateId) : '',
      });
    } else if (!isOpen) {
      setForm(EMPTY_STATE);
      setError(null);
    }
  }, [detail.data, isOpen]);

  const editMutation = useMutation({
    mutationFn: async ({ id, ...body }: BatchesEditInput) =>
      unwrap(await batchesEdit({ path: { id }, body })),
    onSuccess: (res) => {
      if (res.ok) {
        onClose();
      } else {
        setError(reasonToMessage(res.reason));
      }
    },
    onError: (err: Error) => setError(err.message),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['food', 'fridge'] });
    },
  });

  const isFromRun = detail.data?.sourceType === 'recipe_run';

  return {
    detail,
    prepStates,
    form,
    setForm,
    error,
    setError,
    editMutation,
    isFromRun,
  };
}

export function reasonToMessage(reason: string): string {
  if (reason === 'BadExpiry') return 'Expiry date must be on or after the produced date.';
  if (reason === 'CannotEditFromRun') return 'Cook-yielded batches keep their prep state.';
  return reason;
}
