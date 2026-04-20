import { trpc } from '@pops/api-client';
import { ErrorAlert, PageHeader } from '@pops/ui';

import { ActiveBudgets } from './dashboard/ActiveBudgets';
import { RecentTransactions } from './dashboard/RecentTransactions';
import { computeStats, StatsGrid } from './dashboard/StatsGrid';

export function DashboardPage() {
  const {
    data: transactions,
    isLoading: transactionsLoading,
    error: transactionsError,
  } = trpc.finance.transactions.list.useQuery({ limit: 10 });
  const { data: budgets, isLoading: budgetsLoading } = trpc.finance.budgets.list.useQuery({
    limit: 5,
  });

  const stats = computeStats(transactions?.data, transactions?.pagination.total);

  if (transactionsError) {
    return (
      <div className="container mx-auto py-8">
        <PageHeader title="Dashboard" className="mb-6" />
        <ErrorAlert
          title="Unable to load dashboard"
          message="The backend API is not responding. Make sure the pops-api server is running."
          details={transactionsError.message}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-10">
      <PageHeader title="Dashboard" description="Welcome back! Here's your financial overview." />
      <section>
        <StatsGrid stats={stats} isLoading={transactionsLoading} />
      </section>
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Recent Transactions</h2>
        </div>
        <RecentTransactions transactions={transactions?.data} isLoading={transactionsLoading} />
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Active Budgets</h2>
        <ActiveBudgets budgets={budgets?.data} isLoading={budgetsLoading} />
      </section>
    </div>
  );
}
