import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { computeMergedEntities } from '../../../lib/merged-state';
import { trpc } from '../../../lib/trpc';
import type { ProcessedTransaction } from '../../../store/importStore';
import { useImportStore } from '../../../store/importStore';

interface UseBulkAssignmentArgs {
  setLocalTransactions: Dispatch<
    SetStateAction<{
      matched: ProcessedTransaction[];
      uncertain: ProcessedTransaction[];
      failed: ProcessedTransaction[];
      skipped: ProcessedTransaction[];
    }>
  >;
  handleEntitySelect: (
    transaction: ProcessedTransaction,
    entityId: string,
    entityName: string
  ) => void;
  autoSaveRuleAndReEvaluate: (
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

/**
 * Manages bulk assignment operations: accept-all, create-and-assign-all,
 * entity creation, and the EntityCreateDialog state for the ReviewStep.
 */
export function useBulkAssignment({
  setLocalTransactions,
  handleEntitySelect,
  autoSaveRuleAndReEvaluate,
  generateProposal,
}: UseBulkAssignmentArgs) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<ProcessedTransaction | null>(null);
  const [pendingBulkTransactions, setPendingBulkTransactions] = useState<
    ProcessedTransaction[] | null
  >(null);

  const { data: dbEntitiesData } = trpc.core.entities.list.useQuery({});
  const pendingEntities = useImportStore((s) => s.pendingEntities);
  const addPendingEntity = useImportStore((s) => s.addPendingEntity);

  const entities = useMemo(
    () =>
      dbEntitiesData?.data
        ? computeMergedEntities(dbEntitiesData.data, pendingEntities)
        : undefined,
    [dbEntitiesData?.data, pendingEntities]
  );

  const handleCreateEntity = useCallback((transaction: ProcessedTransaction) => {
    setSelectedTransaction(transaction);
    setShowCreateDialog(true);
  }, []);

  const handleAcceptAiSuggestion = useCallback(
    (transaction: ProcessedTransaction) => {
      if (!transaction.entity?.entityName) return;

      // Try to find entity by name if entityId is missing
      let entityId = transaction.entity.entityId;
      if (!entityId && entities) {
        const matchingEntity = entities.find(
          (e: { name: string; id: string }) =>
            e.name.toLowerCase() === transaction.entity?.entityName?.toLowerCase()
        );
        if (matchingEntity) {
          entityId = matchingEntity.id;
        }
      }

      // Entity doesn't exist yet, need to create it first
      if (!entityId) {
        handleCreateEntity(transaction);
        return;
      }

      const entityName = transaction.entity.entityName;

      // Always accept the transaction itself
      handleEntitySelect(transaction, entityId, entityName);

      autoSaveRuleAndReEvaluate(transaction, entityId, entityName);
    },
    [handleEntitySelect, entities, handleCreateEntity, autoSaveRuleAndReEvaluate]
  );

  /**
   * Accept all transactions in a group (create entity if needed)
   */
  const handleAcceptAll = useCallback(
    async (transactions: ProcessedTransaction[]) => {
      if (transactions.length === 0) return;

      const firstTx = transactions[0];
      const entityName = firstTx?.entity?.entityName;
      if (!entityName) {
        toast.error('No entity name found');
        return;
      }

      try {
        // Check if entity exists
        let entityId = entities?.find((e) => e.name.toLowerCase() === entityName.toLowerCase())?.id;

        // Create a pending entity if it doesn't exist
        if (!entityId) {
          const pending = addPendingEntity(
            { name: entityName, type: 'company' },
            dbEntitiesData?.data
          );
          entityId = pending.tempId;
        }

        const resolvedEntityId = entityId;

        // Assign to all transactions (functional setState avoids stale closure)
        setLocalTransactions((prev) => {
          let updated = { ...prev };
          for (const transaction of transactions) {
            updated = {
              ...updated,
              uncertain: updated.uncertain.filter((t: ProcessedTransaction) => t !== transaction),
              failed: updated.failed.filter((t: ProcessedTransaction) => t !== transaction),
              matched: [
                ...updated.matched,
                {
                  ...transaction,
                  entity: {
                    entityId: resolvedEntityId,
                    entityName,
                    matchType: 'ai' as const,
                    confidence: 1,
                  },
                  status: 'matched' as const,
                } as ProcessedTransaction,
              ],
            };
          }
          return updated;
        });
        toast.success(
          `Accepted ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`
        );

        // Auto-save correction rule using the first transaction and re-evaluate
        if (firstTx) {
          autoSaveRuleAndReEvaluate(firstTx, resolvedEntityId, entityName);
        }
      } catch (error) {
        toast.error(
          `Failed to accept: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
    [
      entities,
      addPendingEntity,
      dbEntitiesData?.data,
      autoSaveRuleAndReEvaluate,
      setLocalTransactions,
    ]
  );

  /**
   * Open dialog to create entity and assign to all transactions in group
   */
  const handleCreateAndAssignAll = useCallback(
    (transactions: ProcessedTransaction[], _entityName: string) => {
      // Store transactions for bulk assignment after creation
      setPendingBulkTransactions(transactions);
      // Use first transaction as the "selected" one to get the suggested name
      const first = transactions[0];
      setSelectedTransaction(first ?? null);
      setShowCreateDialog(true);
    },
    []
  );

  const handleEntityCreated = useCallback(
    (entity: { entityId: string; entityName: string }) => {
      // Handle bulk assignment if pending
      if (pendingBulkTransactions && pendingBulkTransactions.length > 0) {
        const bulkCount = pendingBulkTransactions.length;
        // Capture the first transaction BEFORE we clear pendingBulkTransactions —
        // we need its description/amount/type to seed the proposal signal so a
        // rule actually gets learned (otherwise next import re-surfaces the
        // same uncertain matches).
        const firstTx = pendingBulkTransactions[0] ?? null;
        setLocalTransactions((prev) => {
          let updated = { ...prev };
          for (const transaction of pendingBulkTransactions) {
            updated = {
              ...updated,
              uncertain: updated.uncertain.filter((t: ProcessedTransaction) => t !== transaction),
              failed: updated.failed.filter((t: ProcessedTransaction) => t !== transaction),
              matched: [
                ...updated.matched,
                {
                  ...transaction,
                  entity: {
                    entityId: entity.entityId,
                    entityName: entity.entityName,
                    matchType: 'ai' as const,
                    confidence: 1,
                  },
                  status: 'matched' as const,
                } as ProcessedTransaction,
              ],
            };
          }
          return updated;
        });
        setPendingBulkTransactions(null);
        setSelectedTransaction(null);
        toast.success(
          `Created "${entity.entityName}" and assigned to ${bulkCount} transaction${bulkCount !== 1 ? 's' : ''}`
        );

        // Route through the CorrectionProposalDialog so a persistent rule is
        // learned against the NEWLY-RENAMED entity. Using firstTx (the
        // ORIGINAL pre-correction transaction) gives the signal analyzer a
        // better shot at a broad pattern (e.g. "IKEA") instead of the
        // txn-specific one the original AI suggestion would have produced.
        if (firstTx) {
          void generateProposal({
            triggeringTransaction: firstTx,
            entityId: entity.entityId,
            entityName: entity.entityName,
            location: firstTx.location ?? null,
            transactionType: firstTx.transactionType ?? null,
          });
        }
      } else if (selectedTransaction) {
        // Handle single transaction assignment
        handleEntitySelect(selectedTransaction, entity.entityId, entity.entityName);
        setSelectedTransaction(null);
      }
    },
    [
      selectedTransaction,
      pendingBulkTransactions,
      handleEntitySelect,
      generateProposal,
      setLocalTransactions,
    ]
  );

  return {
    showCreateDialog,
    setShowCreateDialog,
    selectedTransaction,
    setSelectedTransaction,
    pendingBulkTransactions,
    setPendingBulkTransactions,
    entities,
    dbEntitiesData,
    handleCreateEntity,
    handleAcceptAiSuggestion,
    handleAcceptAll,
    handleCreateAndAssignAll,
    handleEntityCreated,
  };
}
