import { registerResultComponent, type ResultComponentProps } from '@pops/navigation';
import { formatCurrency, highlightMatch, SearchResultItem } from '@pops/ui';

function formatAmount(amount: number): string {
  return formatCurrency(amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPriority(priority: string | null | undefined): string {
  if (!priority) return '';
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function WishlistResult({ data }: ResultComponentProps) {
  const item = (data.item as string) ?? '';
  const priority = data.priority as string | null | undefined;
  const targetAmount = data.targetAmount as number | null | undefined;
  const query = (data._query as string) ?? '';
  const matchField = (data._matchField as string) ?? '';
  const matchType = (data._matchType as string) ?? '';

  const shouldHighlight = matchField === 'item' && query;

  return (
    <SearchResultItem
      title={shouldHighlight ? highlightMatch(item, query, matchType) : item}
      meta={priority ? [<span key="priority">{formatPriority(priority)}</span>] : undefined}
      trailing={
        targetAmount != null ? (
          <div className="text-muted-foreground shrink-0 text-sm font-medium">
            {formatAmount(targetAmount)}
          </div>
        ) : undefined
      }
    />
  );
}

registerResultComponent('wishlist', WishlistResult);
