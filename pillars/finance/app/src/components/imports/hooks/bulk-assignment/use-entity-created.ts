import { useCallback } from 'react';
import { toast } from 'sonner';

import { type LocalTxState, moveToMatched, pluralize, type UseBulkAssignmentArgs } from './types';

import type { Dispatch, SetStateAction } from 'react';

import type { ProcessedTransaction } from '../../../../store/importStore';

interface UseEntityCreatedArgs {
  pendingBulkTransactions: ProcessedTransaction[] | null;
  selectedTransaction: ProcessedTransaction | null;
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
  setPendingBulkTransactions: Dispatch<SetStateAction<ProcessedTransaction[] | null>>;
  setSelectedTransaction: Dispatch<SetStateAction<ProcessedTransaction | null>>;
  handleEntitySelect: UseBulkAssignmentArgs['handleEntitySelect'];
  generateProposal: UseBulkAssignmentArgs['generateProposal'];
}

export function useEntityCreated(args: UseEntityCreatedArgs) {
  const {
    pendingBulkTransactions,
    selectedTransaction,
    setLocalTransactions,
    setPendingBulkTransactions,
    setSelectedTransaction,
    handleEntitySelect,
    generateProposal,
  } = args;
  return useCallback(
    (entity: { entityId: string; entityName: string }) => {
      if (pendingBulkTransactions && pendingBulkTransactions.length > 0) {
        const bulkCount = pendingBulkTransactions.length;
        const firstTx = pendingBulkTransactions[0] ?? null;
        setLocalTransactions((prev) => moveToMatched(prev, pendingBulkTransactions, entity));
        setPendingBulkTransactions(null);
        setSelectedTransaction(null);
        toast.success(`Created "${entity.entityName}" and assigned to ${pluralize(bulkCount)}`);
        if (firstTx) {
          void generateProposal({
            triggeringTransaction: firstTx,
            entityId: entity.entityId,
            entityName: entity.entityName,
            location: firstTx.location ?? null,
            transactionType: firstTx.transactionType ?? null,
          });
        }
        return;
      }
      if (selectedTransaction) {
        handleEntitySelect(selectedTransaction, entity.entityId, entity.entityName);
        setSelectedTransaction(null);
      }
    },
    [
      pendingBulkTransactions,
      selectedTransaction,
      setLocalTransactions,
      setPendingBulkTransactions,
      setSelectedTransaction,
      handleEntitySelect,
      generateProposal,
    ]
  );
}
