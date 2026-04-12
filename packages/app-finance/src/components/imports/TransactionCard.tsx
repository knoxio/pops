import type { ProcessedTransaction } from '@pops/api/modules/finance/imports';
import { Badge } from '@pops/ui';
import { Button } from '@pops/ui';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@pops/ui';
import { ChevronRight, Pencil, Sparkles, Zap } from 'lucide-react';
import { useState } from 'react';

import { EntitySelect } from './EntitySelect';
import { LocationField } from './LocationField';

interface TransactionCardProps {
  transaction: ProcessedTransaction;
  onEntitySelect?: (
    transaction: ProcessedTransaction,
    entityId: string,
    entityName: string
  ) => void;
  onCreateEntity?: (transaction: ProcessedTransaction) => void;
  onAcceptAiSuggestion?: (transaction: ProcessedTransaction) => void;
  onEdit?: (transaction: ProcessedTransaction) => void;
  entities?: Array<{ id: string; name: string; type: string }>;
  readonly?: boolean;
  showMatchType?: boolean;
  variant?: 'matched' | 'uncertain' | 'failed';
}

/**
 * Reusable transaction card component with expandable raw data
 */
export function TransactionCard({
  transaction,
  onEntitySelect,
  onCreateEntity,
  onAcceptAiSuggestion,
  onEdit,
  entities,
  readonly = false,
  showMatchType = false,
  variant = 'matched',
}: TransactionCardProps) {
  const [isRawDataExpanded, setIsRawDataExpanded] = useState(false);

  const hasAiSuggestion = transaction.entity?.matchType === 'ai' && transaction.entity?.entityName;

  const ruleProvenance = transaction.ruleProvenance;
  const isRuleMatched = Boolean(ruleProvenance) || transaction.entity?.matchType === 'learned';

  // Check if AI-suggested entity actually exists in the entities list
  const aiSuggestedEntityExists =
    hasAiSuggestion &&
    entities?.some((e) => e.name.toLowerCase() === transaction.entity?.entityName?.toLowerCase());

  const isAutoMatched = transaction.entity?.matchType === ('auto-matched' as never);
  const isEdited = (transaction as ProcessedTransaction & { manuallyEdited?: boolean })
    .manuallyEdited;

  // Parse raw row for display
  let rawData: Record<string, string>;
  try {
    rawData = JSON.parse(transaction.rawRow);
  } catch {
    rawData = { error: 'Failed to parse raw data' };
  }

  // Border and background colors based on variant
  const borderColor =
    variant === 'uncertain'
      ? 'border-yellow-200 dark:border-yellow-800'
      : variant === 'failed'
        ? 'border-red-200 dark:border-red-800'
        : 'border-gray-200 dark:border-gray-700';

  const bgColor =
    variant === 'uncertain'
      ? 'bg-yellow-50 dark:bg-yellow-950'
      : variant === 'failed'
        ? 'bg-red-50 dark:bg-red-950'
        : 'bg-white dark:bg-gray-800';

  return (
    <div
      className={`border rounded-lg p-4 ${borderColor} ${bgColor}`}
      data-testid="transaction-card"
      aria-label={transaction.description}
    >
      {/* Header row: date, amount, description */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium">{transaction.description}</span>
            {isEdited && (
              <Badge variant="secondary" className="text-xs">
                Edited
              </Badge>
            )}
            {isAutoMatched && (
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <Zap className="w-3 h-3" />
                Auto-matched
              </Badge>
            )}
            {isRuleMatched && (
              <Badge
                variant="secondary"
                className="text-xs"
                title={
                  ruleProvenance
                    ? [
                        `Rule matched`,
                        `Pattern: ${ruleProvenance.pattern}`,
                        `Match type: ${ruleProvenance.matchType}`,
                        `Confidence: ${Math.round(ruleProvenance.confidence * 100)}%`,
                      ].join('\n')
                    : 'Rule matched'
                }
              >
                Rule matched
              </Badge>
            )}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {transaction.date} • ${Math.abs(transaction.amount).toFixed(2)}
          </div>
          {ruleProvenance && (
            <div className="mt-1 text-xs text-muted-foreground">
              <span className="font-mono">
                {ruleProvenance.matchType}
                {' • '}
                {Math.round(ruleProvenance.confidence * 100)}%
              </span>
              {' • '}
              <span
                className="font-mono truncate inline-block max-w-[28ch] align-bottom"
                title={ruleProvenance.pattern}
              >
                {ruleProvenance.pattern}
              </span>
            </div>
          )}
        </div>

        {onEdit && !readonly && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(transaction)}
            className="ml-2"
            aria-label={`Edit ${transaction.description}`}
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
            <span className="sr-only">Edit</span>
          </Button>
        )}
      </div>

      {/* Field grid: account, location, type */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div className="text-sm">
          <span className="text-gray-500">Account:</span>{' '}
          <span className="font-medium">{transaction.account}</span>
        </div>

        {transaction.location && (
          <div className="col-span-2">
            <LocationField transaction={transaction} />
          </div>
        )}
      </div>

      {/* Entity selector with AI suggestions */}
      {!readonly && (
        <div className="mb-3">
          {hasAiSuggestion && (
            <div className="mb-2 p-2 bg-purple-50 dark:bg-purple-950 rounded-md border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="text-sm text-purple-700 dark:text-purple-300">
                  AI suggestion: {transaction.entity.entityName}
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
                    {aiSuggestedEntityExists ? '✓' : '+'} Accept "{transaction.entity.entityName}"
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
            value={transaction.entity?.entityId || ''}
            onChange={(entityId, entityName) => {
              if (onEntitySelect) {
                onEntitySelect(transaction, entityId, entityName);
              }
            }}
          />
        </div>
      )}

      {/* Readonly: show entity and match type */}
      {readonly && transaction.entity?.entityName && (
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
      )}

      {/* Error display */}
      {transaction.error && (
        <div className="text-sm text-red-700 dark:text-red-300 mb-3">{transaction.error}</div>
      )}

      {/* Collapsible raw data section */}
      <Collapsible open={isRawDataExpanded} onOpenChange={setIsRawDataExpanded}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
          <ChevronRight
            className={`w-4 h-4 transition-transform ${isRawDataExpanded ? 'rotate-90' : ''}`}
          />
          <span>Raw CSV data</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded-md overflow-x-auto">
            {JSON.stringify(rawData, null, 2)}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
