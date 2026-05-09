import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { type Transaction } from './types';

export interface MutationDeps {
  setIsDialogOpen: (v: boolean) => void;
  setEditingTransaction: (t: Transaction | null) => void;
  setDeletingTx: (t: Transaction | null) => void;
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

  // Restore re-inserts via a dedicated server endpoint that preserves the
  // original id, checksum, raw_row, and notion_id — fields that the list
  // shape strips. Routing through `create` would generate a fresh id and
  // drop dedup metadata, breaking re-import deduplication.
  const restoreMutation = trpc.finance.transactions.restore.useMutation({
    onSuccess: () => {
      toast.success('Transaction restored');
      void utils.finance.transactions.list.invalidate();
      void utils.finance.transactions.availableTags.invalidate();
    },
    onError: (err) => toast.error(`Failed to restore transaction: ${err.message}`),
  });

  const deleteMutation = trpc.finance.transactions.delete.useMutation({
    onSuccess: () => {
      void utils.finance.transactions.list.invalidate();
      deps.setDeletingTx(null);
    },
    onError: (err) => toast.error(err.message),
  });

  /**
   * Confirm a delete: hard-delete on the server, capture the full snapshot
   * from the response, and surface a toast with an Undo action that calls
   * `restore` with that snapshot.
   */
  const confirmDelete = (tx: Transaction): void => {
    deleteMutation.mutate(
      { id: tx.id },
      {
        onSuccess: (response) => {
          const { snapshot } = response;
          toast.success(`Deleted: ${tx.description}`, {
            action: {
              label: 'Undo',
              onClick: () => restoreMutation.mutate(snapshot),
            },
            duration: 6000,
          });
        },
      }
    );
  };

  return { createMutation, updateMutation, deleteMutation, confirmDelete };
}
