import { useCallback } from 'react';

import type { Dispatch, SetStateAction } from 'react';

import type { ProcessedTransaction } from '../../../store/importStore';

interface LocalTxState {
  matched: ProcessedTransaction[];
  uncertain: ProcessedTransaction[];
  failed: ProcessedTransaction[];
  skipped: ProcessedTransaction[];
}

type GenerateProposal = (args: {
  triggeringTransaction: ProcessedTransaction;
  entityId: string | null;
  entityName: string | null;
  location?: string | null;
  transactionType?: 'purchase' | 'transfer' | 'income' | null;
}) => Promise<void>;

interface MoveArgs {
  transaction: ProcessedTransaction;
  entityId: string;
  entityName: string;
  matchType: 'manual' | 'ai';
}

function moveOneToMatched(prev: LocalTxState, args: MoveArgs): LocalTxState {
  const { transaction, entityId, entityName, matchType } = args;
  return {
    ...prev,
    uncertain: prev.uncertain.filter((t) => t.checksum !== transaction.checksum),
    failed: prev.failed.filter((t) => t.checksum !== transaction.checksum),
    matched: [
      ...prev.matched,
      {
        ...transaction,
        entity: { entityId, entityName, matchType, confidence: 1 },
        status: 'matched' as const,
      } as ProcessedTransaction,
    ],
  };
}

interface UseReviewActionsArgs {
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
  findSimilar: (t: ProcessedTransaction) => ProcessedTransaction[];
  generateProposal: GenerateProposal;
}

export function useReviewActions({
  setLocalTransactions,
  findSimilar,
  generateProposal,
}: UseReviewActionsArgs) {
  const handleBulkEntitySelect = useCallback(
    (transactions: ProcessedTransaction[], entityId: string, entityName: string) => {
      if (transactions.length === 0) return;
      setLocalTransactions((prev) => {
        let updated = prev;
        for (const t of transactions) {
          updated = moveOneToMatched(updated, {
            transaction: t,
            entityId,
            entityName,
            matchType: 'manual',
          });
        }
        return updated;
      });
      const firstTx = transactions[0];
      if (firstTx) {
        void generateProposal({
          triggeringTransaction: firstTx,
          entityId,
          entityName,
          location: firstTx.location ?? null,
          transactionType: firstTx.transactionType ?? null,
        });
      }
    },
    [generateProposal, setLocalTransactions]
  );

  const handleEntitySelect = useCallback(
    (transaction: ProcessedTransaction, entityId: string, entityName: string) => {
      const similar = findSimilar(transaction);
      setLocalTransactions((prev) =>
        moveOneToMatched(prev, { transaction, entityId, entityName, matchType: 'manual' })
      );
      if (similar.length > 0) {
        void generateProposal({
          triggeringTransaction: transaction,
          entityId,
          entityName,
          location: transaction.location ?? null,
          transactionType: transaction.transactionType ?? null,
        });
      }
    },
    [findSimilar, generateProposal, setLocalTransactions]
  );

  return { handleBulkEntitySelect, handleEntitySelect };
}
