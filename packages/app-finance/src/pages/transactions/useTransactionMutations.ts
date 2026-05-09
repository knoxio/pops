import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { type Transaction } from './types';

export interface MutationDeps {
  setIsDialogOpen: (v: boolean) => void;
  setEditingTransaction: (t: Transaction | null) => void;
  setDeletingTx: (t: Transaction | null) => void;
}

/** Build a CreateTransactionInput-shaped payload from a Transaction snapshot. */
function snapshotToCreatePayload(
  tx: Transaction
): Parameters<ReturnType<typeof trpc.finance.transactions.create.useMutation>['mutate']>[0] {
  return {
    description: tx.description,
    account: tx.account,
    amount: tx.amount,
    date: tx.date,
    type: tx.type,
    tags: tx.tags ?? [],
    entityId: tx.entityId,
    entityName: tx.entityName,
    location: tx.location,
    country: tx.country ?? null,
    relatedTransactionId: tx.relatedTransactionId ?? null,
    notes: tx.notes ?? null,
  };
}

export function useTransactionMutations(deps: MutationDeps) {
  const utils = trpc.useUtils();
  const createMutation = trpc.finance.transactions.create.useMutation({
    onSuccess: () => {
      toast.success('Transaction created');
      void utils.finance.transactions.list.invalidate();
      void utils.finance.transactions.availableTags.invalidate();
      deps.setIsDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.finance.transactions.update.useMutation({
    onSuccess: () => {
      toast.success('Transaction updated');
      void utils.finance.transactions.list.invalidate();
      void utils.finance.transactions.availableTags.invalidate();
      deps.setIsDialogOpen(false);
      deps.setEditingTransaction(null);
    },
    onError: (err) => toast.error(err.message),
  });

  // Server-side delete is hard; the only path back is to re-create from a
  // client-side snapshot. A dedicated mutation keeps the restore toast and
  // skips the form-dialog plumbing the regular create mutation runs.
  const restoreMutation = trpc.finance.transactions.create.useMutation({
    onSuccess: () => {
      toast.success('Transaction restored');
      void utils.finance.transactions.list.invalidate();
      void utils.finance.transactions.availableTags.invalidate();
    },
    onError: (err) => toast.error(`Failed to restore transaction: ${err.message}`),
  });

  // Per-call onSuccess (via mutate(..., { onSuccess })) carries the Transaction
  // snapshot needed for Undo; the defaults below run for every caller.
  const deleteMutation = trpc.finance.transactions.delete.useMutation({
    onSuccess: () => {
      void utils.finance.transactions.list.invalidate();
      deps.setDeletingTx(null);
    },
    onError: (err) => toast.error(err.message),
  });

  /**
   * Confirm a delete: hard-delete on the server, then surface a toast with
   * an Undo action that re-creates the transaction from the snapshot.
   */
  const confirmDelete = (tx: Transaction): void => {
    deleteMutation.mutate(
      { id: tx.id },
      {
        onSuccess: () => {
          toast.success(`Deleted: ${tx.description}`, {
            action: {
              label: 'Undo',
              onClick: () => restoreMutation.mutate(snapshotToCreatePayload(tx)),
            },
            duration: 6000,
          });
        },
      }
    );
  };

  return { createMutation, updateMutation, deleteMutation, confirmDelete };
}
