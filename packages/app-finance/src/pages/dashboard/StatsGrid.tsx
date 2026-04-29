import { useTranslation } from 'react-i18next';

import { SkeletonGrid, StatCard, type StatCardColor } from '@pops/ui';

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

export function signedColor(amount: number): StatCardColor {
  if (amount > 0) return 'emerald';
  if (amount < 0) return 'rose';
  return 'slate';
}

export function StatsGrid({ stats, isLoading }: { stats: Stats | null; isLoading: boolean }) {
  const { t } = useTranslation('finance');
  if (isLoading) {
    return <SkeletonGrid count={4} itemHeight="h-32" cols="sm:grid-cols-2 lg:grid-cols-4" />;
  }
  if (!stats) return null;
  const netBalance = stats.totalIncome - stats.totalExpenses;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title={t('dashboard.totalTransactions')}
        value={stats.totalTransactions.toLocaleString()}
        description={t('dashboard.allTimeTransactions')}
        color="slate"
      />
      <StatCard
        title={t('dashboard.recentIncome')}
        value={`$${stats.totalIncome.toFixed(2)}`}
        description={t('dashboard.last10')}
        color={signedColor(stats.totalIncome)}
      />
      <StatCard
        title={t('dashboard.recentExpenses')}
        value={`$${stats.totalExpenses.toFixed(2)}`}
        description={t('dashboard.last10')}
        color={signedColor(-stats.totalExpenses)}
      />
      <StatCard
        title={t('dashboard.netBalance')}
        value={`$${netBalance.toFixed(2)}`}
        description={t('dashboard.last10')}
        color={signedColor(netBalance)}
      />
    </div>
  );
}
