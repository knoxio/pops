import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { Dispatch, SetStateAction } from 'react';

import type { ProcessedTransaction } from '../../../store/importStore';

type LocalTxState = {
  matched: ProcessedTransaction[];
  uncertain: ProcessedTransaction[];
  failed: ProcessedTransaction[];
  skipped: ProcessedTransaction[];
};

type GenerateProposal = (args: {
  triggeringTransaction: ProcessedTransaction;
  entityId: string | null;
  entityName: string | null;
  location?: string | null;
  transactionType?: 'purchase' | 'transfer' | 'income' | null;
}) => Promise<void>;

interface UseTransactionEditingArgs {
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
  generateProposal: GenerateProposal;
}

function detectChange(
  transaction: ProcessedTransaction,
  editedFields: Partial<ProcessedTransaction>
): boolean {
  return (
    editedFields.description !== transaction.description ||
    editedFields.amount !== transaction.amount ||
    editedFields.entity?.entityId !== transaction.entity?.entityId ||
    editedFields.location !== transaction.location ||
    editedFields.transactionType !== transaction.transactionType
  );
}

function pickValue<T>(edited: T | undefined, original: T | undefined, fallback: T): T {
  return edited ?? original ?? fallback;
}

function buildLearnArgs(
  transaction: ProcessedTransaction,
  editedFields: Partial<ProcessedTransaction>
) {
  return {
    triggeringTransaction: transaction,
    entityId: editedFields.entity?.entityId ?? transaction.entity?.entityId ?? null,
    entityName: editedFields.entity?.entityName ?? transaction.entity?.entityName ?? null,
    location: editedFields.location ?? transaction.location ?? null,
    transactionType: pickValue(
      editedFields.transactionType,
      transaction.transactionType,
      'purchase' as const
    ),
  };
}

function applyEditToBucket(
  prev: LocalTxState,
  transaction: ProcessedTransaction,
  updatedTx: ProcessedTransaction
): LocalTxState {
  const isNoEntityType =
    updatedTx.transactionType === 'transfer' || updatedTx.transactionType === 'income';
  if (isNoEntityType) {
    return {
      ...prev,
      matched: prev.matched.some((t) => t === transaction)
        ? prev.matched.map((t) =>
            t === transaction ? { ...updatedTx, status: 'matched' as const } : t
          )
        : [...prev.matched, { ...updatedTx, status: 'matched' as const }],
      uncertain: prev.uncertain.filter((t) => t !== transaction),
      failed: prev.failed.filter((t) => t !== transaction),
      skipped: prev.skipped.filter((t) => t !== transaction),
    };
  }
  const replace = (list: ProcessedTransaction[]): ProcessedTransaction[] =>
    list.map((t) => (t === transaction ? updatedTx : t));
  return {
    ...prev,
    matched: replace(prev.matched),
    uncertain: replace(prev.uncertain),
    failed: replace(prev.failed),
    skipped: replace(prev.skipped),
  };
}

function showLearnToast(invokeRetry: () => void): void {
  toast.info('Apply this correction to future imports?', {
    description: 'This will help auto-match similar transactions next time.',
    action: { label: 'Save & Learn', onClick: invokeRetry },
  });
  toast.success('Transaction updated');
}

interface SaveEditDeps {
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
  setEditingTransaction: Dispatch<SetStateAction<ProcessedTransaction | null>>;
  generateProposal: GenerateProposal;
}

function buildSaveEdit(deps: SaveEditDeps) {
  const fn = (
    transaction: ProcessedTransaction,
    editedFields: Partial<ProcessedTransaction>,
    shouldLearn = false
  ): void => {
    const isRuleMatched =
      Boolean(transaction.ruleProvenance) || transaction.entity?.matchType === 'learned';
    const hasChanges = detectChange(transaction, editedFields);

    if (isRuleMatched && hasChanges) {
      deps.setEditingTransaction(null);
      void deps.generateProposal(buildLearnArgs(transaction, editedFields));
      return;
    }

    const updatedTx: ProcessedTransaction = {
      ...transaction,
      ...editedFields,
      manuallyEdited: true,
    };
    deps.setLocalTransactions((prev) => applyEditToBucket(prev, transaction, updatedTx));
    deps.setEditingTransaction(null);

    if (shouldLearn && hasChanges) {
      void deps.generateProposal(buildLearnArgs(transaction, editedFields));
      return;
    }
    if (hasChanges) {
      showLearnToast(() => fn(transaction, editedFields, true));
      return;
    }
    toast.success('Transaction updated');
  };
  return fn;
}

/**
 * Manages transaction editing state and save/cancel handlers for the ReviewStep.
 */
export function useTransactionEditing({
  setLocalTransactions,
  generateProposal,
}: UseTransactionEditingArgs) {
  const [editingTransaction, setEditingTransaction] = useState<ProcessedTransaction | null>(null);

  const handleEdit = useCallback((transaction: ProcessedTransaction) => {
    setEditingTransaction(transaction);
  }, []);

  const handleSaveEdit = useCallback(
    buildSaveEdit({ setLocalTransactions, setEditingTransaction, generateProposal }),
    [setLocalTransactions, generateProposal]
  );

  const handleCancelEdit = useCallback(() => setEditingTransaction(null), []);

  return { editingTransaction, handleEdit, handleSaveEdit, handleCancelEdit };
}
