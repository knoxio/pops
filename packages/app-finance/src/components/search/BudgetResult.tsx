import { registerResultComponent, type ResultComponentProps } from '@pops/navigation';

/**
 * Highlight the matched portion of text based on query and matchType.
 * Returns a React fragment with the matched portion wrapped in <mark>.
 */
function highlightMatch(text: string, query: string, matchType: string): React.ReactNode {
  if (!query) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  let start = -1;
  if (matchType === 'exact') {
    start = 0;
  } else if (matchType === 'prefix') {
    start = 0;
  } else if (matchType === 'contains') {
    start = lowerText.indexOf(lowerQuery);
  }

  if (start === -1) return text;

  const end = start + query.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-sm bg-warning/20 px-0.5 dark:bg-warning/30">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

function formatAmount(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `$${amount.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPeriod(period: string | null | undefined): string {
  if (!period) return '';
  if (period === 'monthly') return 'Monthly';
  if (period === 'yearly') return 'Yearly';
  // Handle date-like periods e.g. "2025-06"
  return period;
}

export function BudgetResult({ data }: ResultComponentProps) {
  const category = (data.category as string) ?? '';
  const period = data.period as string | null | undefined;
  const amount = data.amount as number | null | undefined;
  const query = (data._query as string) ?? '';
  const matchField = (data._matchField as string) ?? '';
  const matchType = (data._matchType as string) ?? '';

  const shouldHighlight = matchField === 'category' && query;

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">
          {shouldHighlight ? highlightMatch(category, query, matchType) : category}
        </div>
        {period && <div className="text-muted-foreground text-sm">{formatPeriod(period)}</div>}
      </div>
      <div className="text-muted-foreground shrink-0 text-sm font-medium">
        {formatAmount(amount)}
      </div>
    </div>
  );
}

registerResultComponent('budgets', BudgetResult);
