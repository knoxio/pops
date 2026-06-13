import { toast } from 'sonner';

import { usePillarMutation } from '@pops/pillar-sdk/react';

import { type Transaction } from './types';

import type { TransactionSnapshot } from '@pops/api/modules/finance/transactions/types';

export interface MutationDeps {
  setIsDialogOpen: (v: boolean) => void;
  setEditingTransaction: (t: Transaction | null) => void;
  setDeletingTx: (t: Transaction | null) => void;
}

interface CreateInput {
  description: string;
  account: string;
  amount: number;
  date: string;
  type: string;
  tags: string[];
  entityId: string | null;
  entityName: string | null;
  notes: string | null;
}
interface UpdateInput {
  id: string;
  data: Partial<CreateInput>;
}
interface DeleteInput {
  id: string;
}
interface MutationResponse {
  data?: Transaction;
  message?: string;
}
interface DeleteResponse {
  message: string;
  snapshot: TransactionSnapshot;
}

function useCreateUpdateMutations(deps: MutationDeps) {
  const createMutation = usePillarMutation<CreateInput, MutationResponse>(
    'finance',
    ['transactions', 'create'],
    {
      onSuccess: () => {
        toast.success('Transaction created');
        deps.setIsDialogOpen(false);
      },
      onError: (err) => toast.error(err.message),
    }
  );
  const updateMutation = usePillarMutation<UpdateInput, MutationResponse>(
    'finance',
    ['transactions', 'update'],
    {
      onSuccess: () => {
        toast.success('Transaction updated');
        deps.setIsDialogOpen(false);
        deps.setEditingTransaction(null);
      },
      onError: (err) => toast.error(err.message),
    }
  );
  return { createMutation, updateMutation };
}

function useRestoreDeleteMutations(deps: MutationDeps) {
  const restoreMutation = usePillarMutation<TransactionSnapshot, MutationResponse>(
    'finance',
    ['transactions', 'restore'],
    {
      onSuccess: () => {
        toast.success('Transaction restored');
      },
      onError: (err) => toast.error(`Failed to restore transaction: ${err.message}`),
    }
  );
  const deleteMutation = usePillarMutation<DeleteInput, DeleteResponse>(
    'finance',
    ['transactions', 'delete'],
    {
      onSuccess: () => {
        deps.setDeletingTx(null);
      },
      onError: (err) => toast.error(err.message),
    }
  );
  return { restoreMutation, deleteMutation };
}

export function useTransactionMutations(deps: MutationDeps) {
  const { createMutation, updateMutation } = useCreateUpdateMutations(deps);
  const { restoreMutation, deleteMutation } = useRestoreDeleteMutations(deps);

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
