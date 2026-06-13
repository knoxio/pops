/**
 * State + mutation hook for `EditBatchModal` — keeps the React
 * component thin enough to satisfy the `max-lines-per-function` lint
 * rule.
 */
import { useEffect, useState } from 'react';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';

type BatchesGetOutput = inferRouterOutputs<AppRouter>['food']['batches']['get'];
type PrepStatesListOutput = inferRouterOutputs<AppRouter>['food']['prepStates']['list'];
type BatchesEditInput = inferRouterInputs<AppRouter>['food']['batches']['edit'];
type BatchesEditOutput = inferRouterOutputs<AppRouter>['food']['batches']['edit'];

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
  const utils = usePillarUtils('food');
  const detail = usePillarQuery<BatchesGetOutput>(
    'food',
    ['batches', 'get'],
    { id: batchId ?? 0 },
    { enabled: isOpen && batchId !== null }
  );
  const prepStates = usePillarQuery<PrepStatesListOutput>(
    'food',
    ['prepStates', 'list'],
    undefined,
    { enabled: isOpen }
  );
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

  const editMutation = usePillarMutation<BatchesEditInput, BatchesEditOutput>(
    'food',
    ['batches', 'edit'],
    {
      onSuccess: (res) => {
        if (res.ok) {
          void utils.invalidate(['fridge', 'view']);
          onClose();
        } else {
          setError(reasonToMessage(res.reason));
        }
      },
      onError: (err) => setError(err.message),
    }
  );

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
