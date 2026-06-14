import { useCallback } from 'react';
import { useMemo } from 'react';
import { toast } from 'sonner';

import { usePillarQuery } from '@pops/pillar-sdk/react';

import { computeMergedEntities } from '../../../../lib/merged-state';
import { useImportStore } from '../../../../store/importStore';
import { type LocalTxState, moveToMatched, pluralize, type UseBulkAssignmentArgs } from './types';

import type { Dispatch, SetStateAction } from 'react';

import type { Entity } from '@pops/api/modules/core/entities/types';

import type { ProcessedTransaction } from '../../../../store/importStore';

interface EntitiesListResult {
  data: Entity[];
  pagination: { total: number };
}

export function useEntities() {
  const { data: dbEntitiesData } = usePillarQuery<EntitiesListResult>(
    'core',
    ['entities', 'list'],
    {}
  );
  const pendingEntities = useImportStore((s) => s.pendingEntities);
  const addPendingEntity = useImportStore((s) => s.addPendingEntity);
  const entities = useMemo(
    () =>
      dbEntitiesData?.data
        ? computeMergedEntities(dbEntitiesData.data, pendingEntities)
        : undefined,
    [dbEntitiesData?.data, pendingEntities]
  );
  return { entities, addPendingEntity, dbEntitiesData };
}

interface AcceptAllArgs {
  entities: ReturnType<typeof useEntities>['entities'];
  addPendingEntity: ReturnType<typeof useEntities>['addPendingEntity'];
  dbEntitiesData: ReturnType<typeof useEntities>['dbEntitiesData'];
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
  generateProposal: UseBulkAssignmentArgs['generateProposal'];
}

function resolveEntityId(
  entityName: string,
  entities: AcceptAllArgs['entities'],
  addPendingEntity: AcceptAllArgs['addPendingEntity'],
  dbEntitiesData: AcceptAllArgs['dbEntitiesData']
): string {
  const existing = entities?.find((e) => e.name.toLowerCase() === entityName.toLowerCase())?.id;
  if (existing) return existing;
  const pending = addPendingEntity({ name: entityName, type: 'company' }, dbEntitiesData?.data);
  return pending.tempId;
}

/**
 * Bulk-accept assigns the AI-suggested entity to every transaction in the
 * group and then opens the Correction Proposal dialog seeded from the first
 * transaction. Approving the proposal persists a rule, so future imports
 * match the same descriptor automatically instead of re-prompting.
 */
export function useAcceptAll(args: AcceptAllArgs) {
  const { entities, addPendingEntity, dbEntitiesData, setLocalTransactions, generateProposal } =
    args;
  return useCallback(
    async (transactions: ProcessedTransaction[]) => {
      if (transactions.length === 0) return;
      const firstTx = transactions[0];
      const entityName = firstTx?.entity?.entityName;
      if (!firstTx || !entityName) {
        toast.error('No entity name found');
        return;
      }
      try {
        const entityId = resolveEntityId(entityName, entities, addPendingEntity, dbEntitiesData);
        setLocalTransactions((prev) => moveToMatched(prev, transactions, { entityId, entityName }));
        toast.success(`Accepted ${pluralize(transactions.length)} as "${entityName}"`);
        void generateProposal({
          triggeringTransaction: firstTx,
          entityId,
          entityName,
          location: firstTx.location ?? null,
          transactionType: firstTx.transactionType ?? null,
        });
      } catch (error) {
        toast.error(
          `Failed to accept: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
    [entities, addPendingEntity, dbEntitiesData, setLocalTransactions, generateProposal]
  );
}

export function useAcceptAiSuggestion(args: {
  entities: ReturnType<typeof useEntities>['entities'];
  handleEntitySelect: UseBulkAssignmentArgs['handleEntitySelect'];
  handleCreateEntity: (transaction: ProcessedTransaction) => void;
  openRuleProposalDialog: UseBulkAssignmentArgs['openRuleProposalDialog'];
}) {
  const { entities, handleEntitySelect, handleCreateEntity, openRuleProposalDialog } = args;
  return useCallback(
    (transaction: ProcessedTransaction) => {
      if (!transaction.entity?.entityName) return;
      let entityId = transaction.entity.entityId;
      if (!entityId && entities) {
        const matching = entities.find(
          (e) => e.name.toLowerCase() === transaction.entity?.entityName?.toLowerCase()
        );
        if (matching) entityId = matching.id;
      }
      if (!entityId) {
        handleCreateEntity(transaction);
        return;
      }
      const entityName = transaction.entity.entityName;
      handleEntitySelect(transaction, entityId, entityName);
      openRuleProposalDialog(transaction, entityId, entityName);
    },
    [handleEntitySelect, entities, handleCreateEntity, openRuleProposalDialog]
  );
}
