import { Badge, Card, SkeletonGrid } from '@pops/ui';

import type { Budget } from '@pops/api/modules/finance/budgets/types';

function BudgetCard({ budget }: { budget: Budget }) {
  return (
    <Card className="p-5 flex flex-col justify-between h-full">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-muted-foreground uppercase text-2xs tracking-widest">
            {budget.category}
          </h3>
          <Badge variant={budget.active ? 'default' : 'secondary'} className="text-2xs h-5">
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
  );
}

export function ActiveBudgets({
  budgets,
  isLoading,
}: {
  budgets: Budget[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <SkeletonGrid count={3} itemHeight="h-32" cols="md:grid-cols-3" />;
  }
  if (!budgets || budgets.length === 0) {
    return <p className="text-sm text-muted-foreground">No active budgets found</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {budgets.slice(0, 3).map((budget) => (
        <BudgetCard key={budget.id} budget={budget} />
      ))}
    </div>
  );
}
