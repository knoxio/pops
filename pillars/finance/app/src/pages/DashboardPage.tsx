import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ErrorAlert, PageHeader } from '@pops/ui';

import { unwrap } from '../finance-api-helpers.js';
import { budgetsList, transactionsList } from '../finance-api/index.js';
import { fetchAllPages } from '../lib/fetch-all-pages';
import { ActiveBudgets } from './dashboard/ActiveBudgets';
import { getCurrentMonthRange } from './dashboard/dateRange';
import { PendingImports } from './dashboard/PendingImports';
import { RecentTransactions } from './dashboard/RecentTransactions';
import { computeStats, StatsGrid } from './dashboard/StatsGrid';

import type { TFunction } from 'i18next';

const RECENT_TRANSACTIONS_INPUT = { limit: 10 } as const;
const BUDGETS_LIST_INPUT = { limit: 3, active: 'true' } as const;

function useMonthStatsQuery() {
  const { startDate, endDate } = getCurrentMonthRange();
  return useQuery({
    queryKey: ['finance', 'transactions', 'list', 'month-stats', startDate, endDate],
    queryFn: async () =>
      fetchAllPages(async (page) =>
        unwrap(await transactionsList({ query: { ...page, startDate, endDate } }))
      ),
  });
}

function useDashboardData() {
  const recentTransactionsQuery = useQuery({
    queryKey: ['finance', 'transactions', 'list', RECENT_TRANSACTIONS_INPUT],
    queryFn: async () => unwrap(await transactionsList({ query: RECENT_TRANSACTIONS_INPUT })),
  });
  const monthStatsQuery = useMonthStatsQuery();
  const budgetsQuery = useQuery({
    queryKey: ['finance', 'budgets', 'list', BUDGETS_LIST_INPUT],
    queryFn: async () => unwrap(await budgetsList({ query: BUDGETS_LIST_INPUT })),
  });

  return {
    recentTransactionsQuery,
    monthStatsQuery,
    budgetsQuery,
    stats: computeStats(monthStatsQuery.data?.data, recentTransactionsQuery.data?.pagination.total),
    error: recentTransactionsQuery.error ?? monthStatsQuery.error,
  };
}

function DashboardErrorView({ t, error }: { t: TFunction<'finance'>; error: Error }) {
  return (
    <div className="container mx-auto py-8">
      <PageHeader title={t('dashboard')} className="mb-6" />
      <ErrorAlert
        title={t('dashboard.unableToLoad')}
        message={t('dashboard.apiNotResponding')}
        details={error.message}
      />
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation('finance');
  const { recentTransactionsQuery, monthStatsQuery, budgetsQuery, stats, error } =
    useDashboardData();

  if (error) {
    return <DashboardErrorView t={t} error={error} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-10">
      <PageHeader title={t('dashboard')} description={t('dashboard.welcome')} />
      <section>
        <StatsGrid
          stats={stats}
          isLoading={recentTransactionsQuery.isLoading || monthStatsQuery.isLoading}
        />
      </section>
      <PendingImports />
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">
            {t('dashboard.recentTransactions')}
          </h2>
        </div>
        <RecentTransactions
          transactions={recentTransactionsQuery.data?.data}
          isLoading={recentTransactionsQuery.isLoading}
        />
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">{t('dashboard.activeBudgets')}</h2>
        <ActiveBudgets
          budgets={budgetsQuery.data?.data}
          isLoading={budgetsQuery.isLoading}
          error={budgetsQuery.error}
        />
      </section>
    </div>
  );
}
