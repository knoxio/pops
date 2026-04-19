import { registerResultComponent } from '@pops/navigation';
import { formatCurrency, formatDate, highlightMatch, SearchResultItem } from '@pops/ui';

import type { ResultComponentProps } from '@pops/navigation';

interface TransactionData {
  description: string;
  amount: number;
  date: string;
  entityName: string | null;
  type: 'income' | 'expense' | 'transfer';
}

function amountColorClass(type: 'income' | 'expense' | 'transfer'): string {
  switch (type) {
    case 'income':
      return 'text-success';
    case 'expense':
      return 'text-destructive';
    case 'transfer':
      return 'text-muted-foreground';
  }
}

export function TransactionsResultComponent({ data, query, matchField }: ResultComponentProps) {
  const tx = data as unknown as TransactionData;
  const shouldHighlight = matchField === 'description' && query;

  return (
    <SearchResultItem
      title={shouldHighlight ? highlightMatch(tx.description, query) : tx.description}
      meta={tx.entityName ? [<span key="entity">{tx.entityName}</span>] : undefined}
      trailing={
        <div className="flex flex-col items-end shrink-0">
          <span className={`text-sm font-medium ${amountColorClass(tx.type)}`}>
            {(() => {
              if (tx.type === 'income') return '+';
              if (tx.type === 'expense') return '-';
              return '';
            })()}
            {formatCurrency(Math.abs(tx.amount), {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(tx.date)}</span>
        </div>
      }
    />
  );
}

registerResultComponent('transactions', TransactionsResultComponent);
