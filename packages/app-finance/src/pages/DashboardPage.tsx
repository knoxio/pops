import { trpc } from '@pops/api-client';
/**
 * Dashboard page - overview of finances
 */
import { Badge, Card, ErrorAlert, PageHeader, SkeletonGrid, StatCard } from '@pops/ui';

import type { Budget } from '@pops/api/modules/finance/budgets/types';
import type { Transaction } from '@pops/api/modules/finance/transactions/types';

export function DashboardPage() {
  // Fetch recent transactions
  const {
    data: transactions,
    isLoading: transactionsLoading,
    error: transactionsError,
  } = trpc.finance.transactions.list.useQuery({
    limit: 10,
  });

  // Fetch budgets
  const { data: budgets, isLoading: budgetsLoading } = trpc.finance.budgets.list.useQuery({
    limit: 5,
  });

  // Calculate stats from transactions
  const stats = transactions?.data
    ? {
        totalTransactions: transactions.pagination.total,
        recentCount: transactions.data.length,
        totalIncome: transactions.data
          .filter((t: Transaction) => t.amount > 0)
          .reduce((sum: number, t: Transaction) => sum + t.amount, 0),
        totalExpenses: transactions.data
          .filter((t: Transaction) => t.amount < 0)
          .reduce((sum: number, t: Transaction) => sum + Math.abs(t.amount), 0),
      }
    : null;

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

      {/* Stats Grid */}
      <section>
        {(() => {
          if (transactionsLoading) {
            return (
              <SkeletonGrid count={4} itemHeight="h-32" cols="sm:grid-cols-2 lg:grid-cols-4" />
            );
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
        })()}
      </section>

      {/* Recent Transactions */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Recent Transactions</h2>
        </div>
        {(() => {
          if (transactionsLoading) {
            return <SkeletonGrid count={3} itemHeight="h-16" cols="grid-cols-1" gap="gap-3" />;
          }
          if (!transactions || transactions.data.length === 0) {
            return (
              <Card className="p-12 text-center text-muted-foreground border-dashed">
                No transactions found
              </Card>
            );
          }
          return (
            <Card className="overflow-hidden p-0">
              <div className="divide-y divide-border">
                {transactions.data.map((transaction: Transaction) => (
                  <div
                    key={transaction.id}
                    className="p-4 flex items-center justify-between gap-4 hover:bg-muted/50 transition-colors"
                  >
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
                            <p className="text-xs text-muted-foreground truncate">
                              {transaction.entityName}
                            </p>
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
                        {transaction.amount < 0 ? '-' : '+'}$
                        {Math.abs(transaction.amount).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })()}
      </section>

      {/* Active Budgets */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Active Budgets</h2>
        {(() => {
          if (budgetsLoading) {
            return <SkeletonGrid count={3} itemHeight="h-32" cols="md:grid-cols-3" />;
          }
          if (!budgets || budgets.data.length === 0) {
            return <p className="text-sm text-muted-foreground">No active budgets found</p>;
          }
          return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {budgets.data.slice(0, 3).map((budget: Budget) => (
                <Card key={budget.id} className="p-5 flex flex-col justify-between h-full">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-muted-foreground uppercase text-2xs tracking-widest">
                        {budget.category}
                      </h3>
                      <Badge
                        variant={budget.active ? 'default' : 'secondary'}
                        className="text-2xs h-5"
                      >
                        {budget.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">
                        ${budget.amount ? budget.amount.toFixed(2) : '0.00'}
                      </span>
                      <span className="text-xs text-muted-foreground">/ {budget.period}</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          );
        })()}
      </section>
    </div>
  );
}
