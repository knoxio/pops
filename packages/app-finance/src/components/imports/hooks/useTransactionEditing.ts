import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { ProcessedTransaction } from '../../../store/importStore';

interface UseTransactionEditingArgs {
  setLocalTransactions: Dispatch<
    SetStateAction<{
      matched: ProcessedTransaction[];
      uncertain: ProcessedTransaction[];
      failed: ProcessedTransaction[];
      skipped: ProcessedTransaction[];
    }>
  >;
  generateProposal: (args: {
    triggeringTransaction: ProcessedTransaction;
    entityId: string | null;
    entityName: string | null;
    location?: string | null;
    transactionType?: 'purchase' | 'transfer' | 'income' | null;
  }) => Promise<void>;
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
    (
      transaction: ProcessedTransaction,
      editedFields: Partial<ProcessedTransaction>,
      shouldLearn: boolean = false
    ) => {
      const isRuleMatched =
        Boolean(transaction.ruleProvenance) || transaction.entity?.matchType === 'learned';

      // Detect what changed (include description/amount changes so Save & Learn works for any edit)
      const hasChanges =
        editedFields.description !== transaction.description ||
        editedFields.amount !== transaction.amount ||
        editedFields.entity?.entityId !== transaction.entity?.entityId ||
        editedFields.location !== transaction.location ||
        editedFields.transactionType !== transaction.transactionType;

      if (isRuleMatched && hasChanges) {
        setEditingTransaction(null);

        const entityId = editedFields.entity?.entityId ?? transaction.entity?.entityId ?? null;
        const entityName =
          editedFields.entity?.entityName ?? transaction.entity?.entityName ?? null;
        const updatedLocation = editedFields.location ?? transaction.location ?? null;
        const updatedType =
          editedFields.transactionType ?? transaction.transactionType ?? 'purchase';

        // Pass the ORIGINAL transaction so the AI analyzes the unedited
        // description — using the user's edited string would learn a rule
        // that only matches the (already-corrected) value the user typed.
        void generateProposal({
          triggeringTransaction: transaction,
          entityId,
          entityName,
          location: updatedLocation,
          transactionType: updatedType,
        });

        return;
      }

      const updatedTx: ProcessedTransaction = {
        ...transaction,
        ...editedFields,
        manuallyEdited: true,
      };
      const isNoEntityType =
        updatedTx.transactionType === 'transfer' || updatedTx.transactionType === 'income';

      setLocalTransactions((prev) => {
        // Transfers and income don't need an entity — promote them straight to matched.
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

        return {
          ...prev,
          matched: prev.matched.map((t: ProcessedTransaction) =>
            t === transaction ? { ...t, ...editedFields, manuallyEdited: true } : t
          ),
          uncertain: prev.uncertain.map((t: ProcessedTransaction) =>
            t === transaction ? { ...t, ...editedFields, manuallyEdited: true } : t
          ),
          failed: prev.failed.map((t: ProcessedTransaction) =>
            t === transaction ? { ...t, ...editedFields, manuallyEdited: true } : t
          ),
          skipped: prev.skipped.map((t: ProcessedTransaction) =>
            t === transaction ? { ...t, ...editedFields, manuallyEdited: true } : t
          ),
        };
      });
      setEditingTransaction(null);

      if (shouldLearn && hasChanges) {
        const entityId = editedFields.entity?.entityId ?? transaction.entity?.entityId ?? null;
        const entityName =
          editedFields.entity?.entityName ?? transaction.entity?.entityName ?? null;
        const updatedLocation = editedFields.location ?? transaction.location ?? null;
        const updatedType =
          editedFields.transactionType ?? transaction.transactionType ?? 'purchase';
        // Same reasoning as above: feed the AI the original transaction.
        void generateProposal({
          triggeringTransaction: transaction,
          entityId,
          entityName,
          location: updatedLocation,
          transactionType: updatedType,
        });
      } else if (hasChanges && !shouldLearn) {
        // Show toast asking if they want to learn
        toast.info('Apply this correction to future imports?', {
          description: 'This will help auto-match similar transactions next time.',
          action: {
            label: 'Save & Learn',
            onClick: () => {
              handleSaveEdit(transaction, editedFields, true);
            },
          },
        });
        toast.success('Transaction updated');
      } else {
        toast.success('Transaction updated');
      }
    },
    [generateProposal, setLocalTransactions]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingTransaction(null);
  }, []);

  return {
    editingTransaction,
    handleEdit,
    handleSaveEdit,
    handleCancelEdit,
  };
}
