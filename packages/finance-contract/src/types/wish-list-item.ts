export const WISH_LIST_PRIORITIES = ['low', 'medium', 'high'] as const;

export type WishListPriority = (typeof WISH_LIST_PRIORITIES)[number];

/**
 * A single row on a user's wishlist. The shape mirrors the API response
 * (camelCase) — DB-internal shape lives in `@pops/finance-db` and is not
 * surfaced through the contract.
 */
export interface WishListItem {
  id: string;
  item: string;
  targetAmount: number | null;
  saved: number | null;
  /** `targetAmount - saved`, or `null` when either operand is null. */
  remainingAmount: number | null;
  priority: WishListPriority | null;
  url: string | null;
  notes: string | null;
  /** ISO-8601 timestamp. */
  lastEditedTime: string;
}
