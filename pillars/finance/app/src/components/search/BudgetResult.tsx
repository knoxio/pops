import { registerResultComponent, type ResultComponentProps } from '@pops/navigation';
import { formatCurrency, highlightMatch, SearchResultItem } from '@pops/ui';

interface BudgetHitData extends Record<string, unknown> {
  category: string;
  period: string | null;
  amount: number | null;
}

function formatAmount(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return formatCurrency(amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPeriod(period: string | null | undefined): string {
  if (!period) return '';
  if (period === 'monthly') return 'Monthly';
  if (period === 'yearly') return 'Yearly';
  // Handle date-like periods e.g. "2025-06"
  return period;
}

export function BudgetResult({
  data,
  query = '',
  matchField = '',
  matchType,
}: ResultComponentProps<BudgetHitData>) {
  const { category, period, amount } = data;
  const shouldHighlight = matchField === 'category' && query;

  return (
    <SearchResultItem
      title={shouldHighlight ? highlightMatch(category, query, matchType) : category}
      meta={period ? [<span key="period">{formatPeriod(period)}</span>] : undefined}
      trailing={
        <div className="text-muted-foreground shrink-0 text-sm font-medium">
          {formatAmount(amount)}
        </div>
      }
    />
  );
}

registerResultComponent('budgets', BudgetResult);
