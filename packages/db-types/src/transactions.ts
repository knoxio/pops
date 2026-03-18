/**
 * SQLite schema for transactions table (snake_case columns).
 * Used by both notion-sync (writes) and finance-api (reads).
 */
import { z } from "zod/v4";

export const TransactionRowSchema = z.object({
  id: z.string(),
  notion_id: z.string().nullable(),
  description: z.string(),
  account: z.string(),
  amount: z.number(),
  date: z.string(),
  type: z.string(),
  tags: z.string(),
  entity_id: z.string().nullable(),
  entity_name: z.string().nullable(),
  location: z.string().nullable(),
  country: z.string().nullable(),
  related_transaction_id: z.string().nullable(),
  notes: z.string().nullable(),
  last_edited_time: z.string(),
});

export type TransactionRow = z.infer<typeof TransactionRowSchema>;
