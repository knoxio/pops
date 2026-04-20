import { useCallback, useState } from 'react';

import { type UseBulkAssignmentArgs } from './bulk-assignment/types';
import { useAcceptAiSuggestion, useAcceptAll, useEntities } from './bulk-assignment/use-accept';
import { useEntityCreated } from './bulk-assignment/use-entity-created';

import type { ProcessedTransaction } from '../../../store/importStore';

/**
 * Manages bulk assignment operations: accept-all, create-and-assign-all,
 * entity creation, and the EntityCreateDialog state for the ReviewStep.
 */
export function useBulkAssignment(args: UseBulkAssignmentArgs) {
  const { setLocalTransactions, handleEntitySelect, openRuleProposalDialog, generateProposal } =
    args;
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<ProcessedTransaction | null>(null);
  const [pendingBulkTransactions, setPendingBulkTransactions] = useState<
    ProcessedTransaction[] | null
  >(null);

  const { entities, addPendingEntity, dbEntitiesData } = useEntities();

  const handleCreateEntity = useCallback((transaction: ProcessedTransaction) => {
    setSelectedTransaction(transaction);
    setShowCreateDialog(true);
  }, []);

  const handleAcceptAiSuggestion = useAcceptAiSuggestion({
    entities,
    handleEntitySelect,
    handleCreateEntity,
    openRuleProposalDialog,
  });

  const handleAcceptAll = useAcceptAll({
    entities,
    addPendingEntity,
    dbEntitiesData,
    setLocalTransactions,
    openRuleProposalDialog,
  });

  const handleCreateAndAssignAll = useCallback(
    (transactions: ProcessedTransaction[], _entityName: string) => {
      setPendingBulkTransactions(transactions);
      setSelectedTransaction(transactions[0] ?? null);
      setShowCreateDialog(true);
    },
    []
  );

  const handleEntityCreated = useEntityCreated({
    pendingBulkTransactions,
    selectedTransaction,
    setLocalTransactions,
    setPendingBulkTransactions,
    setSelectedTransaction,
    handleEntitySelect,
    generateProposal,
  });

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
