/**
 * Dashboard page - overview of finances
 */
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

/**
 * Simple stats card component
 */
function StatsCard({
  title,
  value,
  description,
  variant = "default",
}: {
  title: string;
  value: string | number;
  description?: string;
  variant?: "default" | "positive" | "negative";
}) {
  const variantClasses = {
    default: "text-foreground",
    positive: "text-green-600 dark:text-green-400",
    negative: "text-red-600 dark:text-red-400",
  };

  return (
    <Card className="p-6">
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <p className={`text-3xl font-bold ${variantClasses[variant]}`}>
          {value}
        </p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
    </Card>
  );
}

export function DashboardPage() {
  // Fetch recent transactions
  const {
    data: transactions,
    isLoading: transactionsLoading,
    error: transactionsError,
  } = trpc.transactions.list.useQuery({
    limit: 10,
  });

  // Fetch budgets
  const { data: budgets, isLoading: budgetsLoading } =
    trpc.budgets.list.useQuery({
      limit: 5,
    });

  // Calculate stats from transactions
  const stats = transactions?.data
    ? {
        totalTransactions: transactions.pagination.total,
        recentCount: transactions.data.length,
        totalIncome: transactions.data
          .filter((t) => t.amount > 0)
          .reduce((sum, t) => sum + t.amount, 0),
        totalExpenses: transactions.data
          .filter((t) => t.amount < 0)
          .reduce((sum, t) => sum + Math.abs(t.amount), 0),
      }
    : null;

  if (transactionsError) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Alert variant="destructive">
          <AlertTitle>Unable to load dashboard</AlertTitle>
          <AlertDescription>
            <p className="mb-2">
              The backend API is not responding. Make sure the finance-api
              server is running.
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer hover:underline font-medium text-sm">
                Show technical details
              </summary>
              <code className="block mt-2 p-3 bg-black/10 dark:bg-black/20 rounded text-xs font-mono whitespace-pre-wrap break-all">
                {transactionsError.message}
              </code>
            </details>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here's your financial overview.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {transactionsLoading ? (
          <>
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </>
        ) : stats ? (
          <>
            <StatsCard
              title="Total Transactions"
              value={stats.totalTransactions.toLocaleString()}
              description="All-time transactions"
            />
            <StatsCard
              title="Recent Income"
              value={`$${stats.totalIncome.toFixed(2)}`}
              description="Last 10 transactions"
              variant="positive"
            />
            <StatsCard
              title="Recent Expenses"
              value={`$${stats.totalExpenses.toFixed(2)}`}
              description="Last 10 transactions"
              variant="negative"
            />
            <StatsCard
              title="Net Balance"
              value={`$${(stats.totalIncome - stats.totalExpenses).toFixed(2)}`}
              description="Last 10 transactions"
              variant={
                stats.totalIncome > stats.totalExpenses
                  ? "positive"
                  : "negative"
              }
            />
          </>
        ) : null}
      </div>

      {/* Recent Transactions */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Recent Transactions</h2>
        {transactionsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : transactions && transactions.data.length > 0 ? (
          <Card>
            <div className="divide-y">
              {transactions.data.map((transaction) => (
                <div
                  key={transaction.id}
                  className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">
                        {transaction.description}
                      </p>
                      {transaction.tags.includes("Online") && (
                        <Badge variant="secondary" className="text-xs">
                          Online
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-sm text-muted-foreground">
                        {new Date(transaction.date).toLocaleDateString("en-AU")}
                      </p>
                      {transaction.entityName && (
                        <>
                          <span className="text-muted-foreground">•</span>
                          <p className="text-sm text-muted-foreground truncate">
                            {transaction.entityName}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="text-xs">
                      {transaction.account}
                    </Badge>
                    <p
                      className={`font-mono font-semibold ${
                        transaction.amount < 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-green-600 dark:text-green-400"
                      }`}
                    >
                      {transaction.amount < 0 ? "-" : "+"}$
                      {Math.abs(transaction.amount).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card className="p-6 text-center text-muted-foreground">
            No transactions found
          </Card>
        )}
      </div>

      {/* Active Budgets */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Active Budgets</h2>
        {budgetsLoading ? (
          <Skeleton className="h-32" />
        ) : budgets && budgets.data.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {budgets.data.slice(0, 3).map((budget) => (
              <Card key={budget.id} className="p-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{budget.category}</h3>
                    <Badge variant={budget.active ? "default" : "secondary"}>
                      {budget.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="text-2xl font-bold">
                    ${budget.amount ? budget.amount.toFixed(2) : "0.00"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {budget.period}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
