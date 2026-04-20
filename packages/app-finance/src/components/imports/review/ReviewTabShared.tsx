import { Layers, List } from 'lucide-react';

import { Button } from '@pops/ui';

import { EditableTransactionCard } from '../EditableTransactionCard';
import { TransactionCard } from '../TransactionCard';
import { TransactionGroup } from '../TransactionGroup';

import type { groupTransactionsByEntity } from '../../../lib/transaction-utils';
import type { ProcessedTransaction } from '../../../store/importStore';
import type { ViewMode } from '../hooks/useTransactionReview';

export interface ReviewTabBaseProps {
  transactions: ProcessedTransaction[];
  groups: ReturnType<typeof groupTransactionsByEntity>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onEntitySelect: (t: ProcessedTransaction, entityId: string, entityName: string) => void;
  onBulkEntitySelect?: (ts: ProcessedTransaction[], entityId: string, entityName: string) => void;
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

export function ViewModeToggle({
  viewMode,
  onViewModeChange,
}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}) {
  return (
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
  );
}

export function GroupedView({
  variant,
  props,
}: {
  variant: 'failed' | 'uncertain';
  props: ReviewTabBaseProps;
}) {
  return (
    <div className="space-y-3">
      {props.groups.map((group, idx) => (
        <TransactionGroup
          key={idx}
          group={group}
          onAcceptAll={props.onAcceptAll}
          onCreateAndAssignAll={props.onCreateAndAssignAll}
          onEntitySelect={props.onEntitySelect}
          onBulkEntitySelect={props.onBulkEntitySelect}
          onCreateEntity={props.onCreateEntity}
          onAcceptAiSuggestion={props.onAcceptAiSuggestion}
          onEdit={props.onEdit}
          editingTransaction={props.editingTransaction}
          onSaveEdit={props.onSaveEdit}
          onCancelEdit={props.onCancelEdit}
          entities={props.entities}
          variant={variant}
        />
      ))}
    </div>
  );
}

export function ListView({
  variant,
  props,
}: {
  variant: 'failed' | 'uncertain';
  props: ReviewTabBaseProps;
}) {
  return (
    <div className="space-y-3">
      {props.transactions.map((t, idx) =>
        props.editingTransaction === t ? (
          <EditableTransactionCard
            key={idx}
            transaction={t}
            onSave={props.onSaveEdit}
            onCancel={props.onCancelEdit}
            entities={props.entities}
          />
        ) : (
          <TransactionCard
            key={idx}
            transaction={t}
            onEntitySelect={props.onEntitySelect}
            onCreateEntity={props.onCreateEntity}
            onAcceptAiSuggestion={props.onAcceptAiSuggestion}
            onEdit={props.onEdit}
            entities={props.entities}
            variant={variant}
          />
        )
      )}
    </div>
  );
}
