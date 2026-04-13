import { Button } from '@pops/ui';
import { Layers, List } from 'lucide-react';

import type { groupTransactionsByEntity } from '../../../lib/transaction-utils';
import type { ProcessedTransaction } from '../../../store/importStore';
import { EditableTransactionCard } from '../EditableTransactionCard';
import type { ViewMode } from '../hooks/useTransactionReview';
import { TransactionCard } from '../TransactionCard';
import { TransactionGroup } from '../TransactionGroup';

interface UncertainTabProps {
  transactions: ProcessedTransaction[];
  groups: ReturnType<typeof groupTransactionsByEntity>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onEntitySelect: (t: ProcessedTransaction, entityId: string, entityName: string) => void;
  onCreateEntity: (t: ProcessedTransaction) => void;
  onAcceptAiSuggestion: (t: ProcessedTransaction) => void;
  onAcceptAll: (transactions: ProcessedTransaction[]) => void;
  onCreateAndAssignAll: (transactions: ProcessedTransaction[], entityName: string) => void;
  onEdit: (t: ProcessedTransaction) => void;
  editingTransaction: ProcessedTransaction | null;
  onSaveEdit: (t: ProcessedTransaction, edited: Partial<ProcessedTransaction>) => void;
  onCancelEdit: () => void;
  entities?: Array<{ id: string; name: string; type: string }>;
}

/**
 * Uncertain tab - needs user review
 */
export function UncertainTab({
  transactions,
  groups,
  viewMode,
  onViewModeChange,
  onEntitySelect,
  onCreateEntity,
  onAcceptAiSuggestion,
  onAcceptAll,
  onCreateAndAssignAll,
  onEdit,
  editingTransaction,
  onSaveEdit,
  onCancelEdit,
  entities,
}: UncertainTabProps) {
  if (transactions.length === 0) {
    return <div className="text-center py-12 text-gray-500">No uncertain transactions</div>;
  }

  return (
    <div className="space-y-4">
      {/* View mode toggle */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant={viewMode === 'list' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewModeChange('list')}
          aria-pressed={viewMode === 'list'}
        >
          <List className="w-4 h-4 mr-1" aria-hidden="true" />
          List
        </Button>
        <Button
          variant={viewMode === 'grouped' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewModeChange('grouped')}
          aria-pressed={viewMode === 'grouped'}
        >
          <Layers className="w-4 h-4 mr-1" aria-hidden="true" />
          Grouped
        </Button>
      </div>

      {/* Grouped view */}
      {viewMode === 'grouped' ? (
        <div className="space-y-3">
          {groups.map((group, idx) => (
            <TransactionGroup
              key={idx}
              group={group}
              onAcceptAll={onAcceptAll}
              onCreateAndAssignAll={onCreateAndAssignAll}
              onEntitySelect={onEntitySelect}
              onCreateEntity={onCreateEntity}
              onAcceptAiSuggestion={onAcceptAiSuggestion}
              onEdit={onEdit}
              editingTransaction={editingTransaction}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              entities={entities}
              variant="uncertain"
            />
          ))}
        </div>
      ) : (
        /* List view */
        <div className="space-y-3">
          {transactions.map((t, idx) =>
            editingTransaction === t ? (
              <EditableTransactionCard
                key={idx}
                transaction={t}
                onSave={onSaveEdit}
                onCancel={onCancelEdit}
                entities={entities}
              />
            ) : (
              <TransactionCard
                key={idx}
                transaction={t}
                onEntitySelect={onEntitySelect}
                onCreateEntity={onCreateEntity}
                onAcceptAiSuggestion={onAcceptAiSuggestion}
                onEdit={onEdit}
                entities={entities}
                variant="uncertain"
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
