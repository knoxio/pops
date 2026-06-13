/**
 * Soft-delete confirm — PRD-147.
 *
 * Distinguishes non-empty vs empty batches in the confirm copy. Calls
 * `food.batches.delete` (PRD-145 soft-delete via `deleted_at`).
 */
import { useEffect, useState, type ReactElement } from 'react';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@pops/ui';

import { FormError } from './form-controls.js';
import { formatQty } from './format.js';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';
import type { BatchDetail } from '@pops/app-food-db';

type BatchesGetOutput = inferRouterOutputs<AppRouter>['food']['batches']['get'];
type BatchesDeleteInput = inferRouterInputs<AppRouter>['food']['batches']['delete'];
type BatchesDeleteOutput = inferRouterOutputs<AppRouter>['food']['batches']['delete'];

export interface DeleteBatchConfirmProps {
  batchId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmed?: () => void;
}

export function DeleteBatchConfirm({
  batchId,
  isOpen,
  onClose,
  onConfirmed,
}: DeleteBatchConfirmProps): ReactElement {
  const utils = usePillarUtils('food');
  const detail = usePillarQuery<BatchesGetOutput>(
    'food',
    ['batches', 'get'],
    { id: batchId ?? 0 },
    { enabled: isOpen && batchId !== null }
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) setError(null);
  }, [isOpen]);

  const deleteMutation = usePillarMutation<BatchesDeleteInput, BatchesDeleteOutput>(
    'food',
    ['batches', 'delete'],
    {
      onSuccess: (res) => {
        if (res.ok) {
          void utils.invalidate(['fridge', 'view']);
          onConfirmed?.();
          onClose();
        } else {
          setError(res.reason);
        }
      },
      onError: (err) => setError(err.message),
    }
  );

  function handleDelete(): void {
    if (batchId === null) return;
    setError(null);
    deleteMutation.mutate({ id: batchId });
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete batch?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm">
            {detail.data?.ingredientName} / {detail.data?.variantName ?? '—'}
          </p>
          <ConfirmCopy detail={detail.data ?? null} />
          <FormError message={error} />
          <DeleteActions
            onClose={onClose}
            onDelete={handleDelete}
            isPending={deleteMutation.isPending}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmCopy({ detail }: { detail: BatchDetail | null }): ReactElement {
  if (detail === null) return <p className="text-sm text-muted-foreground">—</p>;
  if (detail.qtyRemaining === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This batch is empty. Mark as deleted to hide from the default view.
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      This batch still has {formatQty(detail.qtyRemaining, detail.unit)} remaining. Deleting will
      mark it as removed from inventory.
    </p>
  );
}

function DeleteActions({
  onClose,
  onDelete,
  isPending,
}: {
  onClose: () => void;
  onDelete: () => void;
  isPending: boolean;
}): ReactElement {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
        Cancel
      </Button>
      <Button variant="destructive" onClick={onDelete} disabled={isPending}>
        {isPending ? 'Deleting…' : 'Delete'}
      </Button>
    </div>
  );
}
