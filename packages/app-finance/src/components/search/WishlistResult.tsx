import { registerResultComponent } from '@pops/navigation';
import { formatCurrency, highlightMatch, SearchResultItem } from '@pops/ui';

import type { ResultComponentProps } from '@pops/navigation';

export interface WishlistHitData {
  item: string;
  priority: string | null;
  targetAmount: number | null;
}

function formatAmount(amount: number): string {
  return formatCurrency(amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPriority(priority: string | null | undefined): string {
  if (!priority) return '';
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function WishlistResult({ data }: ResultComponentProps<WishlistHitData>) {
  const { item, priority, targetAmount, _query: query = '', _matchField: matchField = '' } = data;
  const matchType = data._matchType ?? '';

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
