import { registerResultComponent } from '@pops/navigation';
import { Badge, formatCurrency, formatDate, highlightMatch, SearchResultItem } from '@pops/ui';

import type { ResultComponentProps } from '@pops/navigation';

type TxType = 'income' | 'expense' | 'transfer';

export interface TransactionHitData {
  description: string;
  amount: number;
  date: string;
  entityName: string | null;
  type: TxType;
}

function amountColorClass(type: TxType): string {
  switch (type) {
    case 'income':
      return 'text-success';
    case 'expense':
      return 'text-destructive';
    case 'transfer':
      return 'text-muted-foreground';
  }
}

export function TransactionsResultComponent({ data }: ResultComponentProps<TransactionHitData>) {
  const {
    description,
    amount,
    date,
    entityName,
    type,
    _query: query,
    _matchField: matchField,
  } = data;
  const shouldHighlight = matchField === 'description' && query;

  return (
    <SearchResultItem
      title={shouldHighlight ? highlightMatch(description, query) : description}
      meta={[
        entityName ? <span key="entity">{entityName}</span> : null,
        <Badge key="type" variant="outline" className="text-2xs uppercase tracking-wider shrink-0">
          {type}
        </Badge>,
      ]}
      trailing={
        <div className="flex flex-col items-end shrink-0">
          <span className={`text-sm font-medium ${amountColorClass(type)}`}>
            {(() => {
              if (type === 'income') return '+';
              if (type === 'expense') return '-';
              return '';
            })()}
            {formatCurrency(Math.abs(amount), {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(date)}</span>
        </div>
      }
    />
  );
}

registerResultComponent('transactions', TransactionsResultComponent);
