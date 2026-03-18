/**
 * SQLite schema for wish_list table (snake_case columns).
 * Used by finance-api for wish list types.
 */
import { z } from "zod/v4";

export const WISH_LIST_PRIORITIES = ["Needing", "Soon", "One Day", "Dreaming"] as const;

export const WishListRowSchema = z.object({
  id: z.string(),
  notion_id: z.string().nullable(),
  item: z.string(),
  target_amount: z.number().nullable(),
  saved: z.number().nullable(),
  priority: z.string().nullable(),
  url: z.string().nullable(),
  notes: z.string().nullable(),
  last_edited_time: z.string(),
});

export type WishListRow = z.infer<typeof WishListRowSchema>;
export type WishListPriority = (typeof WISH_LIST_PRIORITIES)[number];
