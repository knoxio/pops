/**
 * SQLite schema for home_inventory table (snake_case columns).
 * Used by both notion-sync (writes) and finance-api (reads).
 */
import { z } from "zod/v4";

export const InventoryRowSchema = z.object({
  id: z.string(),
  notion_id: z.string().nullable(),
  item_name: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  item_id: z.string().nullable(),
  room: z.string().nullable(),
  location: z.string().nullable(),
  type: z.string().nullable(),
  condition: z.string().nullable(),
  in_use: z.number(),
  deductible: z.number(),
  purchase_date: z.string().nullable(),
  warranty_expires: z.string().nullable(),
  replacement_value: z.number().nullable(),
  resale_value: z.number().nullable(),
  purchase_transaction_id: z.string().nullable(),
  purchased_from_id: z.string().nullable(),
  purchased_from_name: z.string().nullable(),
  last_edited_time: z.string(),
});

export type InventoryRow = z.infer<typeof InventoryRowSchema>;
