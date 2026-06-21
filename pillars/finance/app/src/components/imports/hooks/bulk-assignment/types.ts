import type { Dispatch, SetStateAction } from 'react';

import type { ProcessedTransaction } from '../../../../store/importStore';

export type LocalTxState = {
  matched: ProcessedTransaction[];
  uncertain: ProcessedTransaction[];
  failed: ProcessedTransaction[];
  skipped: ProcessedTransaction[];
};

export interface UseBulkAssignmentArgs {
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
  handleEntitySelect: (
    transaction: ProcessedTransaction,
    entityId: string,
    entityName: string
  ) => void;
  openRuleProposalDialog: (
    triggeringTransaction: ProcessedTransaction,
    entityId: string,
    entityName: string
  ) => void;
  generateProposal: (args: {
    triggeringTransaction: ProcessedTransaction;
    entityId: string | null;
    entityName: string | null;
    location?: string | null;
    transactionType?: 'purchase' | 'transfer' | 'income' | null;
  }) => Promise<void>;
}

export function pluralize(count: number): string {
  return `${count} transaction${count !== 1 ? 's' : ''}`;
}

export function moveToMatched(
  prev: LocalTxState,
  transactions: ProcessedTransaction[],
  entity: { entityId: string; entityName: string; matchType?: 'manual' | 'ai' }
): LocalTxState {
  // Default to 'manual' so EntitySection (which renders the AI-suggestion
  // panel for matchType === 'ai') doesn't keep prompting the user to accept
  // a suggestion they already accepted via Accept All / Create new for all.
  const matchType = entity.matchType ?? 'manual';
  let updated = { ...prev };
  for (const transaction of transactions) {
    updated = {
      ...updated,
      uncertain: updated.uncertain.filter((t) => t !== transaction),
      failed: updated.failed.filter((t) => t !== transaction),
      matched: [
        ...updated.matched,
        {
          ...transaction,
          entity: {
            entityId: entity.entityId,
            entityName: entity.entityName,
            matchType,
            confidence: 1,
          },
          status: 'matched' as const,
        } as ProcessedTransaction,
      ],
    };
  }
  return updated;
}
