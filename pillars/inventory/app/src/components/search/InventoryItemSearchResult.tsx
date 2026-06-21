import { Package } from 'lucide-react';

import { formatAUD, highlightMatch, SearchResultItem } from '@pops/ui';

/**
 * InventoryItemSearchResult — ResultComponent for inventory-items search hits.
 *
 * Renders item name (highlighted), location, and formatted value.
 * Registered for domain "inventory-items" in the search result component registry.
 */
import type { ResultComponentProps } from '@pops/navigation';

interface InventoryItemHitData extends Record<string, unknown> {
  itemName: string;
  location: string | null;
  room: string | null;
  replacementValue: number | null;
  brand: string | null;
}

export function InventoryItemSearchResult({
  data,
  query = '',
  matchType = 'contains',
}: ResultComponentProps<InventoryItemHitData>) {
  const { itemName, location, room, replacementValue, brand } = data;

  const locationText = [room, location].filter(Boolean).join(' · ');

  return (
    <SearchResultItem
      data-testid="inventory-item-search-result"
      leading={
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
          <Package className="h-5 w-5 opacity-50" />
        </div>
      }
      title={highlightMatch(itemName, query, matchType)}
      meta={[
        brand && <span key="brand">{brand}</span>,
        locationText && <span key="location">{locationText}</span>,
      ]}
      trailing={
        replacementValue != null ? (
          <span className="shrink-0 text-xs font-medium text-muted-foreground" data-testid="value">
            {formatAUD(replacementValue)}
          </span>
        ) : undefined
      }
    />
  );
}
