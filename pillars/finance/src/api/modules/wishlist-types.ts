/**
 * Wire mapper for the wish-list domain. The zod schemas now live in the
 * REST contract (`src/contract/rest-wishlist.ts`); this file keeps only
 * the row → response projection and its TS shape.
 */
import type { WishListRow } from '../../db/index.js';

/** API response shape (camelCase). */
export interface WishListItem {
  id: string;
  item: string;
  targetAmount: number | null;
  saved: number | null;
  remainingAmount: number | null;
  priority: string | null;
  url: string | null;
  notes: string | null;
  lastEditedTime: string;
}

/**
 * Map a SQLite row to the API response shape. Computes `remainingAmount`
 * as `targetAmount - saved`, or `null` if either is null.
 */
export function toWishListItem(row: WishListRow): WishListItem {
  const remainingAmount =
    row.targetAmount !== null && row.saved !== null ? row.targetAmount - row.saved : null;

  return {
    id: row.id,
    item: row.item,
    targetAmount: row.targetAmount,
    saved: row.saved,
    remainingAmount,
    priority: row.priority,
    url: row.url,
    notes: row.notes,
    lastEditedTime: row.lastEditedTime,
  };
}
