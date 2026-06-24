import type { ListItemRow } from '../../detail/types.js';

/**
 * Client-side sort modes the shopping detail page exposes. Sort is a
 * render-time transform; the server keeps `position` as the canonical
 * order so drag-to-reorder still works after switching back to Manual.
 */
export type ShoppingSortMode = 'manual' | 'unchecked-first' | 'recent-check';

export const SHOPPING_SORT_MODES: readonly ShoppingSortMode[] = [
  'manual',
  'unchecked-first',
  'recent-check',
];

export interface ShoppingItemHandlers {
  onToggleChecked: (id: number, currentlyChecked: boolean) => void;
  onSaveLabel: (id: number, label: string) => Promise<boolean>;
  onMoveUp: (id: number) => void;
  onMoveDown: (id: number) => void;
  onDelete: (id: number) => void;
}

export type { ListItemRow };
