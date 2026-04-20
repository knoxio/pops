import { ChevronRight, Sparkles } from 'lucide-react';

import { Badge, Button, CollapsibleTrigger } from '@pops/ui';

import type { ProcessedTransaction } from '@pops/api/modules/finance/imports';

import type { TransactionGroup as TransactionGroupType } from '../../../lib/transaction-utils';

interface GroupBulkActionsProps {
  group: TransactionGroupType;
  entityExists?: boolean;
  onAcceptAll: (transactions: ProcessedTransaction[]) => void;
  onCreateAndAssignAll: (transactions: ProcessedTransaction[], entityName: string) => void;
  onToggleEntitySelector: () => void;
}

function GroupBulkActions(props: GroupBulkActionsProps) {
  const { group, entityExists, onAcceptAll, onCreateAndAssignAll, onToggleEntitySelector } = props;
  return (
    <div className="flex gap-2">
      {group.aiSuggestion && (
        <>
          <Button
            variant="default"
            size="sm"
            onClick={() => onAcceptAll(group.transactions)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {entityExists ? '✓' : '+'} Accept All as "{group.entityName}"
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCreateAndAssignAll(group.transactions, group.entityName)}
          >
            Create new for all
          </Button>
        </>
      )}
      {!group.aiSuggestion && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCreateAndAssignAll(group.transactions, group.entityName)}
        >
          + Create new for all
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={onToggleEntitySelector}>
        Choose existing...
      </Button>
    </div>
  );
}

export interface GroupHeaderProps extends GroupBulkActionsProps {
  isExpanded: boolean;
  totalAmount: number;
}

export function GroupHeader(props: GroupHeaderProps) {
  const { group, isExpanded, totalAmount } = props;
  return (
    <div
      className={`p-4 ${
        group.aiSuggestion ? 'bg-purple-50 dark:bg-purple-950' : 'bg-gray-50 dark:bg-gray-900'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <CollapsibleTrigger
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <ChevronRight
              className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
            <div className="flex items-center gap-2">
              {group.aiSuggestion && (
                <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              )}
              <h3 className="font-semibold text-lg">{group.entityName}</h3>
            </div>
          </CollapsibleTrigger>
          <div className="flex items-center gap-3 mt-2 ml-7">
            <Badge variant="secondary">
              {group.transactions.length} transaction
              {group.transactions.length !== 1 ? 's' : ''}
            </Badge>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Total: ${totalAmount.toFixed(2)}
            </span>
            {group.category && (
              <Badge variant="outline" className="text-xs">
                {group.category}
              </Badge>
            )}
          </div>
        </div>
        <GroupBulkActions {...props} />
      </div>
    </div>
  );
}
