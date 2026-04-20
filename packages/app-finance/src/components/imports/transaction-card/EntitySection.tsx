import { Sparkles } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

import { EntitySelect } from '../EntitySelect';

import type { ProcessedTransaction } from '@pops/api/modules/finance/imports';

interface AiSuggestionProps {
  transaction: ProcessedTransaction;
  aiSuggestedEntityExists: boolean;
  onAcceptAiSuggestion?: (transaction: ProcessedTransaction) => void;
  onCreateEntity?: (transaction: ProcessedTransaction) => void;
}

function AiSuggestionPanel({
  transaction,
  aiSuggestedEntityExists,
  onAcceptAiSuggestion,
  onCreateEntity,
}: AiSuggestionProps) {
  return (
    <div className="mb-2 p-2 bg-purple-50 dark:bg-purple-950 rounded-md border border-purple-200 dark:border-purple-800">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
        <span className="text-sm text-purple-700 dark:text-purple-300">
          AI suggestion: {transaction.entity?.entityName}
        </span>
      </div>
      <div className="flex gap-2">
        {onAcceptAiSuggestion && (
          <Button
            variant="default"
            size="sm"
            onClick={() => onAcceptAiSuggestion(transaction)}
            className="bg-purple-600 hover:bg-purple-700 flex-1"
          >
            {aiSuggestedEntityExists ? '✓' : '+'} Accept "{transaction.entity?.entityName}"
          </Button>
        )}
        {onCreateEntity && !aiSuggestedEntityExists && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCreateEntity(transaction)}
            className="flex-1"
          >
            Create new
          </Button>
        )}
      </div>
    </div>
  );
}

interface EntitySectionProps {
  transaction: ProcessedTransaction;
  entities?: Array<{ id: string; name: string; type: string }>;
  onEntitySelect?: (
    transaction: ProcessedTransaction,
    entityId: string,
    entityName: string
  ) => void;
  onCreateEntity?: (transaction: ProcessedTransaction) => void;
  onAcceptAiSuggestion?: (transaction: ProcessedTransaction) => void;
}

export function EntitySection(props: EntitySectionProps) {
  const { transaction, entities, onEntitySelect, onCreateEntity, onAcceptAiSuggestion } = props;
  const hasAiSuggestion = transaction.entity?.matchType === 'ai' && transaction.entity?.entityName;
  const aiSuggestedEntityExists = Boolean(
    hasAiSuggestion &&
    entities?.some((e) => e.name.toLowerCase() === transaction.entity?.entityName?.toLowerCase())
  );
  return (
    <div className="mb-3">
      {hasAiSuggestion && (
        <AiSuggestionPanel
          transaction={transaction}
          aiSuggestedEntityExists={aiSuggestedEntityExists}
          onAcceptAiSuggestion={onAcceptAiSuggestion}
          onCreateEntity={onCreateEntity}
        />
      )}
      {!hasAiSuggestion && onCreateEntity && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCreateEntity(transaction)}
          className="w-full mb-2"
        >
          + Create new entity
        </Button>
      )}
      <EntitySelect
        entities={entities ?? []}
        value={transaction.entity?.entityId ?? ''}
        onChange={(entityId, entityName) => onEntitySelect?.(transaction, entityId, entityName)}
      />
    </div>
  );
}

export function ReadonlyEntitySummary({
  transaction,
  showMatchType,
}: {
  transaction: ProcessedTransaction;
  showMatchType: boolean;
}) {
  if (!transaction.entity?.entityName) return null;
  return (
    <div className="mb-3">
      <div className="text-sm">
        <span className="text-gray-500">Entity:</span>{' '}
        <span className="font-medium">{transaction.entity.entityName}</span>
      </div>
      {showMatchType && (
        <Badge variant="secondary" className="text-xs mt-1">
          {transaction.entity.matchType}
        </Badge>
      )}
    </div>
  );
}
