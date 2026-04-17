import { registerResultComponent } from '@pops/navigation';

import type { ResultComponentProps } from '@pops/navigation';

interface TransactionData {
  description: string;
  amount: number;
  date: string;
  entityName: string | null;
  type: 'income' | 'expense' | 'transfer';
}

function formatAmount(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);

  if (idx === -1) return text;

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);

  return (
    <>
      {before}
      <mark className="bg-warning/20 rounded-sm px-0.5">{match}</mark>
      {after}
    </>
  );
}

export function TransactionsResultComponent({ data, query, matchField }: ResultComponentProps) {
  const tx = data as unknown as TransactionData;
  const shouldHighlight = matchField === 'description' && query;

  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium truncate">
          {shouldHighlight ? highlightMatch(tx.description, query) : tx.description}
        </span>
        {tx.entityName && (
          <span className="text-xs text-muted-foreground truncate">{tx.entityName}</span>
        )}
      </div>
      <div className="flex flex-col items-end shrink-0">
        <span className={`text-sm font-medium ${amountColorClass(tx.type)}`}>
          {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
          {formatAmount(tx.amount)}
        </span>
        <span className="text-xs text-muted-foreground">{formatDate(tx.date)}</span>
      </div>
    </div>
  );
}

registerResultComponent('transactions', TransactionsResultComponent);
