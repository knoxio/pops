export const WISH_LIST_PRIORITIES = ['Needing', 'Soon', 'One Day', 'Dreaming'] as const;

export type WishListPriority = (typeof WISH_LIST_PRIORITIES)[number];

/**
 * A single row on a user's wishlist. The shape mirrors the API response
 * (camelCase) — the DB-internal shape lives in the pillar's `src/db` layer and
 * is not surfaced through the contract.
 */
export interface WishListItem {
  id: string;
  item: string;
  targetAmount: number | null;
  saved: number | null;
  /** `targetAmount - saved`, or `null` when either operand is null. */
  remainingAmount: number | null;
  priority: WishListPriority | null;
  /** Absolute URL. Validated by `WishListItemSchema` via `.url()`. */
  url: string | null;
  notes: string | null;
  /** ISO-8601 timestamp. Validated by `WishListItemSchema` via `.datetime()`. */
  lastEditedTime: string;
}
