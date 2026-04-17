/**
 * InventoryItemSearchResult — ResultComponent for inventory-items search hits.
 *
 * Renders item name (highlighted), location, and formatted value.
 * Registered for domain "inventory-items" in the search result component registry.
 */
import type { ResultComponentProps } from '@pops/navigation';
import { Package } from 'lucide-react';

interface InventoryItemHitData {
  itemName: string;
  location: string | null;
  room: string | null;
  replacementValue: number | null;
  brand: string | null;
}

/**
 * Highlight the matched portion of text based on query and match type.
 * Returns React nodes with the matched text wrapped in a <mark>.
 */
export function highlightMatch(text: string, query: string, matchType: string): React.ReactNode {
  if (!query) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const start = matchType === 'exact' || matchType === 'prefix' ? 0 : lowerText.indexOf(lowerQuery);

  if (start === -1) return text;

  const end = start + query.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="bg-warning/20 dark:bg-warning/30 rounded-sm px-0.5">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function InventoryItemSearchResult({ data }: ResultComponentProps) {
  const hit = data as unknown as InventoryItemHitData & {
    _query?: string;
    _matchType?: string;
  };
  const { itemName, location, room, replacementValue, brand } = hit;
  const query = hit._query ?? '';
  const matchType = hit._matchType ?? 'contains';

  const locationText = [room, location].filter(Boolean).join(' · ');

  return (
    <div className="flex items-center gap-3 py-1" data-testid="inventory-item-search-result">
      {/* Icon */}
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
        <Package className="h-5 w-5 opacity-50" />
      </div>

      {/* Text content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium leading-tight">
          {highlightMatch(itemName, query, matchType)}
        </span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {brand && <span>{brand}</span>}
          {brand && locationText && <span>·</span>}
          {locationText && <span>{locationText}</span>}
        </div>
      </div>

      {/* Value */}
      {replacementValue != null && (
        <span className="shrink-0 text-xs font-medium text-muted-foreground" data-testid="value">
          {formatCurrency(replacementValue)}
        </span>
      )}
    </div>
  );
}
