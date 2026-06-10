import { useMemo, useState } from 'react';

import type { ListItemRow, ShoppingSortMode } from './types.js';

/**
 * Owns the client-side sort state for a shopping list and projects the
 * underlying items into the order the UI should render. Sort is **never**
 * persisted — fresh page load defaults to Manual (PRD-141 §Sort behaviours).
 *
 * `sortedItems` is memoised so the items section's identity-sensitive
 * downstream (DnD ordered ids, optimistic updates) doesn't churn unless the
 * source data or sort mode changes.
 */
export interface ShoppingSort {
  mode: ShoppingSortMode;
  setMode: (mode: ShoppingSortMode) => void;
  sortedItems: readonly ListItemRow[];
  /** Drag-to-reorder is disabled unless `mode === 'manual'` (PRD-141 §Edge Cases). */
  isDragDisabled: boolean;
}

export function useShoppingSort(items: readonly ListItemRow[]): ShoppingSort {
  const [mode, setMode] = useState<ShoppingSortMode>('manual');

  const sortedItems = useMemo(() => projectByMode(items, mode), [items, mode]);

  return { mode, setMode, sortedItems, isDragDisabled: mode !== 'manual' };
}

function projectByMode(
  items: readonly ListItemRow[],
  mode: ShoppingSortMode
): readonly ListItemRow[] {
  switch (mode) {
    case 'manual':
      return items;
    case 'unchecked-first':
      return [...items].toSorted((a, b) => {
        if (a.checked !== b.checked) return a.checked - b.checked;
        return a.position - b.position;
      });
    case 'recent-check':
      return [...items].toSorted((a, b) => {
        if (a.checked !== b.checked) return b.checked - a.checked;
        return checkedAtComparator(a.checkedAt, b.checkedAt);
      });
    default:
      return items;
  }
}

function checkedAtComparator(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right.localeCompare(left);
}
