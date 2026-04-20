import { Badge, Card, SkeletonGrid } from '@pops/ui';

import type { Transaction } from '@pops/api/modules/finance/transactions/types';

function TransactionRow({ transaction }: { transaction: Transaction }) {
  return (
    <div className="p-4 flex items-center justify-between gap-4 hover:bg-muted/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate text-base">{transaction.description}</p>
          {transaction.tags.includes('Online') && (
            <Badge
              variant="secondary"
              className="hidden sm:inline-flex text-2xs uppercase tracking-wider px-1.5 py-0"
            >
              Online
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground">
            {new Date(transaction.date).toLocaleDateString('en-AU')}
          </p>
          {transaction.entityName && (
            <>
              <span className="text-muted-foreground/50 text-2xs">•</span>
              <p className="text-xs text-muted-foreground truncate">{transaction.entityName}</p>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <Badge
          variant="outline"
          className="hidden sm:inline-flex text-2xs uppercase tracking-wider px-1.5 py-0 text-muted-foreground font-normal"
        >
          {transaction.account}
        </Badge>
        <p
          className={`text-lg font-bold tabular-nums tracking-tight ${
            transaction.amount < 0 ? 'text-destructive' : 'text-success'
          }`}
        >
          {transaction.amount < 0 ? '-' : '+'}${Math.abs(transaction.amount).toFixed(2)}
        </p>
      </div>
    </div>
  );
}

interface RecentTransactionsProps {
  transactions: Transaction[] | undefined;
  isLoading: boolean;
}

export function RecentTransactions({ transactions, isLoading }: RecentTransactionsProps) {
  if (isLoading) {
    return <SkeletonGrid count={3} itemHeight="h-16" cols="grid-cols-1" gap="gap-3" />;
  }
  if (!transactions || transactions.length === 0) {
    return (
      <Card className="p-12 text-center text-muted-foreground border-dashed">
        No transactions found
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden p-0">
      <div className="divide-y divide-border">
        {transactions.map((t) => (
          <TransactionRow key={t.id} transaction={t} />
        ))}
      </div>
    </Card>
  );
}
