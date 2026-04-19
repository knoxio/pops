import { trpc } from '@pops/api-client';
import { Badge, Card, Skeleton } from '@pops/ui';

function budgetUsageLabel(b: {
  monthlyCostLimit: number | null;
  currentCostUsage: number;
  monthlyTokenLimit: number | null;
  currentTokenUsage: number;
}) {
  if (b.monthlyCostLimit != null) {
    return `$${b.currentCostUsage.toFixed(4)} / $${b.monthlyCostLimit.toFixed(2)}`;
  }
  if (b.monthlyTokenLimit != null) {
    return `${b.currentTokenUsage.toLocaleString()} / ${b.monthlyTokenLimit.toLocaleString()} tokens`;
  }
  return 'No limit';
}

function barColorClass(pct: number) {
  if (pct >= 80) return 'bg-destructive';
  if (pct >= 60) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export function BudgetStatusSection() {
  const { data: budgetStatuses, isLoading } = trpc.core.aiBudgets.getBudgetStatus.useQuery();

  if (isLoading) return <Skeleton className="h-24" />;
  if (!budgetStatuses?.length) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Budgets</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {budgetStatuses.map((b) => {
          const pct = b.percentageUsed ?? 0;
          return (
            <Card key={b.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm capitalize">
                  {b.scopeValue ? `${b.scopeType}: ${b.scopeValue}` : b.scopeType}
                </p>
                <Badge variant="outline" className="text-xs">
                  {b.action}
                </Badge>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${barColorClass(pct)}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{budgetUsageLabel(b)}</span>
                {b.projectedExhaustionDate && (
                  <span className="text-amber-600">Exhausts {b.projectedExhaustionDate}</span>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
