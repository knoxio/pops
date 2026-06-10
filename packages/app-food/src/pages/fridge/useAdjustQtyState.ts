/**
 * State + mutation hook for `AdjustQtyModal` — splits the React side
 * so the modal stays under the `max-lines-per-function` budget.
 */
import { useEffect, useState } from 'react';

import { trpc } from '@pops/api-client';

import type { BatchAdjustReason } from '@pops/app-food-db';

interface UseAdjustQtyArgs {
  batchId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export function useAdjustQtyState({ batchId, isOpen, onClose }: UseAdjustQtyArgs) {
  const utils = trpc.useUtils();
  const detail = trpc.food.batches.get.useQuery(
    { id: batchId ?? 0 },
    { enabled: isOpen && batchId !== null }
  );
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

  const adjustMutation = trpc.food.batches.adjustQty.useMutation({
    onSuccess: (res) => {
      if (res.ok) {
        void utils.food.fridge.view.invalidate();
        onClose();
      } else {
        setError(reasonToMessage(res.reason));
      }
    },
    onError: (err) => setError(err.message),
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
