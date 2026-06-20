import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
/**
 * State + mutation hook for `AdjustQtyModal` — splits the React side
 * so the modal stays under the `max-lines-per-function` budget.
 */
import { useEffect, useState } from 'react';

import { unwrap } from '../../food-api-helpers.js';
import { batchesAdjustQty, batchesGet } from '../../food-api/index.js';

import type { BatchAdjustReason } from '../../food-api-shared-types.js';
import type { BatchesAdjustQtyData } from '../../food-api/types.gen.js';

type BatchesAdjustQtyInput = NonNullable<BatchesAdjustQtyData['body']> & { id: number };

interface UseAdjustQtyArgs {
  batchId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export function useAdjustQtyState({ batchId, isOpen, onClose }: UseAdjustQtyArgs) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['food', 'batches', 'get', { id: batchId ?? 0 }],
    queryFn: async () => unwrap(await batchesGet({ path: { id: batchId ?? 0 } })).data,
    enabled: isOpen && batchId !== null,
  });
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState<BatchAdjustReason>('spoiled');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setDelta('');
      setReason('spoiled');
      setError(null);
    }
  }, [isOpen]);

  const adjustMutation = useMutation({
    mutationFn: async ({ id, ...body }: BatchesAdjustQtyInput) =>
      unwrap(await batchesAdjustQty({ path: { id }, body })),
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

  return {
    detail,
    delta,
    setDelta,
    reason,
    setReason,
    error,
    setError,
    adjustMutation,
  };
}

export function parseDelta(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value === 0) return null;
  return value;
}

function reasonToMessage(reason: string): string {
  if (reason === 'BadAdjustment') return 'Spoiled and wasted require a negative adjustment.';
  if (reason === 'NegativeQty') return 'That adjustment would push the batch below zero.';
  return reason;
}
