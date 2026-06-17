import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ErrorAlert, PageHeader } from '@pops/ui';

import { unwrap } from '../finance-api-helpers.js';
import { budgetsList, transactionsList } from '../finance-api/index.js';
import { ActiveBudgets } from './dashboard/ActiveBudgets';
import { RecentTransactions } from './dashboard/RecentTransactions';
import { computeStats, StatsGrid } from './dashboard/StatsGrid';

const TRANSACTIONS_LIST_INPUT = { limit: 10 } as const;
const BUDGETS_LIST_INPUT = { limit: 5 } as const;

export function DashboardPage() {
  const { t } = useTranslation('finance');
  const {
    data: transactions,
    isLoading: transactionsLoading,
    error: transactionsError,
  } = useQuery({
    queryKey: ['finance', 'transactions', 'list', TRANSACTIONS_LIST_INPUT],
    queryFn: async () => unwrap(await transactionsList({ query: TRANSACTIONS_LIST_INPUT })),
  });
  const { data: budgets, isLoading: budgetsLoading } = useQuery({
    queryKey: ['finance', 'budgets', 'list', BUDGETS_LIST_INPUT],
    queryFn: async () => unwrap(await budgetsList({ query: BUDGETS_LIST_INPUT })),
  });

  const stats = computeStats(transactions?.data, transactions?.pagination.total);

  if (transactionsError) {
    return (
      <div className="container mx-auto py-8">
        <PageHeader title={t('dashboard')} className="mb-6" />
        <ErrorAlert
          title={t('dashboard.unableToLoad')}
          message={t('dashboard.apiNotResponding')}
          details={transactionsError.message}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-10">
      <PageHeader title={t('dashboard')} description={t('dashboard.welcome')} />
      <section>
        <StatsGrid stats={stats} isLoading={transactionsLoading} />
      </section>
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">
            {t('dashboard.recentTransactions')}
          </h2>
        </div>
        <RecentTransactions transactions={transactions?.data} isLoading={transactionsLoading} />
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">{t('dashboard.activeBudgets')}</h2>
        <ActiveBudgets budgets={budgets?.data} isLoading={budgetsLoading} />
      </section>
    </div>
  );
}
