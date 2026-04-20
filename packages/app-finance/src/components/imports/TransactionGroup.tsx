import { useState } from 'react';

import { Collapsible, CollapsibleContent, Label, Select as UiSelect } from '@pops/ui';

import { EditableTransactionCard } from './EditableTransactionCard';
import { GroupHeader } from './transaction-group/GroupHeader';
import { TransactionCard } from './TransactionCard';

import type { ProcessedTransaction } from '@pops/api/modules/finance/imports';

import type { TransactionGroup as TransactionGroupType } from '../../lib/transaction-utils';

interface TransactionGroupProps {
  group: TransactionGroupType;
  onAcceptAll: (transactions: ProcessedTransaction[]) => void;
  onCreateAndAssignAll: (transactions: ProcessedTransaction[], entityName: string) => void;
  onEntitySelect: (transaction: ProcessedTransaction, entityId: string, entityName: string) => void;
  onBulkEntitySelect?: (
    transactions: ProcessedTransaction[],
    entityId: string,
    entityName: string
  ) => void;
  onCreateEntity: (transaction: ProcessedTransaction) => void;
  onAcceptAiSuggestion: (transaction: ProcessedTransaction) => void;
  onEdit: (transaction: ProcessedTransaction) => void;
  editingTransaction?: ProcessedTransaction | null;
  onSaveEdit?: (
    transaction: ProcessedTransaction,
    editedFields: Partial<ProcessedTransaction>
  ) => void;
  onCancelEdit?: () => void;
  entities?: Array<{ id: string; name: string; type: string }>;
  variant?: 'uncertain' | 'failed';
}

interface BulkEntitySelectorProps {
  group: TransactionGroupType;
  entities: Array<{ id: string; name: string; type: string }>;
  onBulkEntitySelect?: TransactionGroupProps['onBulkEntitySelect'];
  onEntitySelect: TransactionGroupProps['onEntitySelect'];
  onClose: () => void;
}

function BulkEntitySelector({
  group,
  entities,
  onBulkEntitySelect,
  onEntitySelect,
  onClose,
}: BulkEntitySelectorProps) {
  return (
    <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600">
      <Label className="block mb-2">
        Select entity to assign to all {group.transactions.length} transactions:
      </Label>
      <UiSelect
        placeholder="Choose entity..."
        options={entities.map((entity) => ({ label: entity.name, value: entity.id }))}
        onChange={(e) => {
          const selectedEntity = entities.find((ent) => ent.id === e.target.value);
          if (!selectedEntity) return;
          if (onBulkEntitySelect) {
            onBulkEntitySelect(group.transactions, selectedEntity.id, selectedEntity.name);
          } else {
            for (const t of group.transactions) {
              onEntitySelect(t, selectedEntity.id, selectedEntity.name);
            }
          }
          onClose();
        }}
        defaultValue=""
      />
    </div>
  );
}

interface TransactionListProps {
  group: TransactionGroupType;
  editingTransaction?: ProcessedTransaction | null;
  onSaveEdit?: TransactionGroupProps['onSaveEdit'];
  onCancelEdit?: () => void;
  onEntitySelect: TransactionGroupProps['onEntitySelect'];
  onCreateEntity: TransactionGroupProps['onCreateEntity'];
  onAcceptAiSuggestion: TransactionGroupProps['onAcceptAiSuggestion'];
  onEdit: TransactionGroupProps['onEdit'];
  entities?: TransactionGroupProps['entities'];
  variant: 'uncertain' | 'failed';
}

function TransactionList(props: TransactionListProps) {
  const { group, editingTransaction, onSaveEdit, onCancelEdit, entities, variant } = props;
  return (
    <div className="p-4 space-y-3 border-t dark:border-gray-700">
      {group.transactions.map((transaction, idx) =>
        editingTransaction === transaction && onSaveEdit && onCancelEdit ? (
          <EditableTransactionCard
            key={idx}
            transaction={transaction}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
            entities={entities}
          />
        ) : (
          <TransactionCard
            key={idx}
            transaction={transaction}
            onEntitySelect={props.onEntitySelect}
            onCreateEntity={props.onCreateEntity}
            onAcceptAiSuggestion={props.onAcceptAiSuggestion}
            onEdit={props.onEdit}
            entities={entities}
            variant={variant}
          />
        )
      )}
    </div>
  );
}

/**
 * Grouped view of transactions with bulk actions
 */
export function TransactionGroup(props: TransactionGroupProps) {
  const { group, entities, variant = 'uncertain' } = props;
  const [isExpanded, setIsExpanded] = useState(false);
  const [showEntitySelector, setShowEntitySelector] = useState(false);

  const totalAmount = group.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const entityExists = Boolean(
    group.aiSuggestion &&
    entities?.some((e) => e.name.toLowerCase() === group.entityName.toLowerCase())
  );

  return (
    <div
      className={`border rounded-lg ${
        group.aiSuggestion
          ? 'border-purple-300 dark:border-purple-700'
          : 'border-gray-200 dark:border-gray-700'
      }`}
      data-testid="transaction-group"
    >
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <GroupHeader
          group={group}
          isExpanded={isExpanded}
          totalAmount={totalAmount}
          entityExists={entityExists}
          onAcceptAll={props.onAcceptAll}
          onCreateAndAssignAll={props.onCreateAndAssignAll}
          onToggleEntitySelector={() => setShowEntitySelector((v) => !v)}
        />
        {showEntitySelector && entities && entities.length > 0 && (
          <BulkEntitySelector
            group={group}
            entities={entities}
            onBulkEntitySelect={props.onBulkEntitySelect}
            onEntitySelect={props.onEntitySelect}
            onClose={() => setShowEntitySelector(false)}
          />
        )}
        <CollapsibleContent>
          <TransactionList
            group={group}
            editingTransaction={props.editingTransaction}
            onSaveEdit={props.onSaveEdit}
            onCancelEdit={props.onCancelEdit}
            onEntitySelect={props.onEntitySelect}
            onCreateEntity={props.onCreateEntity}
            onAcceptAiSuggestion={props.onAcceptAiSuggestion}
            onEdit={props.onEdit}
            entities={entities}
            variant={variant}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
