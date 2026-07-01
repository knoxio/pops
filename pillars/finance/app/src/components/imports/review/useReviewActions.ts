import { useCallback } from 'react';

import type { Dispatch, SetStateAction } from 'react';

import type { ProcessedTransaction } from '../../../store/importStore';

export interface LocalTxState {
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

export interface MoveArgs {
  transaction: ProcessedTransaction;
  entityId: string;
  entityName: string;
  matchType: 'manual' | 'ai';
}

/**
 * Move a transaction into the `matched` bucket with the chosen entity, removing
 * any prior copy of it from every bucket first.
 *
 * The transaction is identified by `checksum`. When it already lives in
 * `matched` (e.g. re-assigning the entity on a rule-matched card) it is replaced
 * in place so the card keeps its position; otherwise it is appended. Failing to
 * drop the existing `matched` entry previously appended a duplicate and left the
 * original card untouched, so picking an entity looked like a no-op.
 *
 * Exported for unit testing the dedupe/replace invariant.
 */
export function moveOneToMatched(prev: LocalTxState, args: MoveArgs): LocalTxState {
  const { transaction, entityId, entityName, matchType } = args;
  const matchedTx = {
    ...transaction,
    entity: { entityId, entityName, matchType, confidence: 1 },
    status: 'matched' as const,
  } as ProcessedTransaction;
  const withoutTx = (list: ProcessedTransaction[]): ProcessedTransaction[] =>
    list.filter((t) => t.checksum !== transaction.checksum);
  const alreadyMatched = prev.matched.some((t) => t.checksum === transaction.checksum);
  return {
    ...prev,
    uncertain: withoutTx(prev.uncertain),
    failed: withoutTx(prev.failed),
    matched: alreadyMatched
      ? prev.matched.map((t) => (t.checksum === transaction.checksum ? matchedTx : t))
      : [...prev.matched, matchedTx],
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
