import { ChevronRight, Pencil } from 'lucide-react';
import { useState } from 'react';

import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@pops/ui';

import { LocationField } from '../LocationField';
import { HeaderBadges } from './badges';

import type { ProcessedTransaction } from '@pops/api/modules/finance/imports';

export function getCardClasses(variant: 'matched' | 'uncertain' | 'failed') {
  if (variant === 'uncertain') return { border: 'border-warning/20', bg: 'bg-warning/5' };
  if (variant === 'failed') return { border: 'border-destructive/20', bg: 'bg-destructive/5' };
  return {
    border: 'border-gray-200 dark:border-gray-700',
    bg: 'bg-white dark:bg-gray-800',
  };
}

export function parseRawData(rawRow: string): Record<string, string> {
  try {
    return JSON.parse(rawRow);
  } catch {
    return { error: 'Failed to parse raw data' };
  }
}

export function CardHeader({
  transaction,
  onEdit,
  readonly,
}: {
  transaction: ProcessedTransaction;
  onEdit?: (t: ProcessedTransaction) => void;
  readonly: boolean;
}) {
  const ruleProvenance = transaction.ruleProvenance;
  return (
    <div className="flex justify-between items-start mb-3">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium">{transaction.description}</span>
          <HeaderBadges transaction={transaction} />
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
  );
}

export function FieldGrid({ transaction }: { transaction: ProcessedTransaction }) {
  return (
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
  );
}

export function RawDataSection({ rawData }: { rawData: Record<string, string> }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
        <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        <span>Raw CSV data</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded-md overflow-x-auto">
          {JSON.stringify(rawData, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
