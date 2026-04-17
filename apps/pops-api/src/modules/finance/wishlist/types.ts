import { z } from 'zod';

import { WISH_LIST_PRIORITIES, type WishListPriority, type WishListRow } from '@pops/db-types';

export { WISH_LIST_PRIORITIES, type WishListPriority, type WishListRow };

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
 * Map a SQLite row to the API response shape.
 * Computes remainingAmount as targetAmount - saved, or null if either is null.
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

/** Zod schema for creating a wish list item. */
export const CreateWishListItemSchema = z.object({
  item: z.string().min(1, 'Item is required'),
  targetAmount: z.number().nullable().optional(),
  saved: z.number().nullable().optional(),
  priority: z.enum(WISH_LIST_PRIORITIES).nullable().optional(),
  url: z.string().url('Invalid URL').nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type CreateWishListItemInput = z.infer<typeof CreateWishListItemSchema>;

/** Zod schema for updating a wish list item (all fields optional). */
export const UpdateWishListItemSchema = z.object({
  item: z.string().min(1, 'Item cannot be empty').optional(),
  targetAmount: z.number().nullable().optional(),
  saved: z.number().nullable().optional(),
  priority: z.enum(WISH_LIST_PRIORITIES).nullable().optional(),
  url: z.string().url('Invalid URL').nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateWishListItemInput = z.infer<typeof UpdateWishListItemSchema>;

/** Zod schema for wish list query params. */
export const WishListQuerySchema = z.object({
  search: z.string().optional(),
  priority: z.string().optional(),
  limit: z.coerce.number().positive().optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type WishListQuery = z.infer<typeof WishListQuerySchema>;
