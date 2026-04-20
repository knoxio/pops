import { SkeletonGrid, StatCard } from '@pops/ui';

import type { Transaction } from '@pops/api/modules/finance/transactions/types';

interface Stats {
  totalTransactions: number;
  totalIncome: number;
  totalExpenses: number;
}

export function computeStats(
  transactions: Transaction[] | undefined,
  total: number | undefined
): Stats | null {
  if (!transactions) return null;
  return {
    totalTransactions: total ?? 0,
    totalIncome: transactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0),
    totalExpenses: transactions
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0),
  };
}

export function StatsGrid({ stats, isLoading }: { stats: Stats | null; isLoading: boolean }) {
  if (isLoading) {
    return <SkeletonGrid count={4} itemHeight="h-32" cols="sm:grid-cols-2 lg:grid-cols-4" />;
  }
  if (!stats) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Transactions"
        value={stats.totalTransactions.toLocaleString()}
        description="All-time transactions"
        color="slate"
      />
      <StatCard
        title="Recent Income"
        value={`$${stats.totalIncome.toFixed(2)}`}
        description="Last 10 transactions"
        color="emerald"
      />
      <StatCard
        title="Recent Expenses"
        value={`$${stats.totalExpenses.toFixed(2)}`}
        description="Last 10 transactions"
        color="rose"
      />
      <StatCard
        title="Net Balance"
        value={`$${(stats.totalIncome - stats.totalExpenses).toFixed(2)}`}
        description="Last 10 transactions"
        color={stats.totalIncome > stats.totalExpenses ? 'emerald' : 'rose'}
      />
    </div>
  );
}
