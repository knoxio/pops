import { registerResultComponent } from '@pops/navigation';
import { Badge, formatCurrency, formatDate, highlightMatch, SearchResultItem } from '@pops/ui';

import type { ResultComponentProps } from '@pops/navigation';

type TxType = 'income' | 'expense' | 'transfer';

interface TransactionHitData extends Record<string, unknown> {
  description: string;
  amount: number;
  date: string;
  entityName: string | null;
  type: string;
}

interface TransactionData {
  description: string;
  amount: number;
  date: string;
  entityName: string | null;
  type: TxType;
}

const VALID_TYPES = new Set<string>(['income', 'expense', 'transfer']);

function parseTransactionData(data: TransactionHitData): TransactionData {
  return {
    description: data.description,
    amount: data.amount,
    date: data.date,
    entityName: data.entityName,
    type: VALID_TYPES.has(data.type) ? (data.type as TxType) : 'expense',
  };
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

export function TransactionsResultComponent({
  data,
  query,
  matchField,
}: ResultComponentProps<TransactionHitData>) {
  const tx = parseTransactionData(data);
  const shouldHighlight = matchField === 'description' && query;

  return (
    <SearchResultItem
      title={shouldHighlight ? highlightMatch(tx.description, query) : tx.description}
      meta={[
        tx.entityName ? <span key="entity">{tx.entityName}</span> : null,
        <Badge key="type" variant="outline" className="text-2xs uppercase tracking-wider shrink-0">
          {tx.type}
        </Badge>,
      ]}
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
