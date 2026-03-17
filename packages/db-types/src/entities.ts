/**
 * SQLite schema for entities table (snake_case columns).
 * Used by finance-api for entity types.
 */
import { z } from "zod/v4";

export const EntityRowSchema = z.object({
  id: z.string(),
  notion_id: z.string().nullable(),
  name: z.string(),
  type: z.string().nullable(),
  abn: z.string().nullable(),
  aliases: z.string().nullable(),
  default_transaction_type: z.string().nullable(),
  default_tags: z.string().nullable(),
  notes: z.string().nullable(),
  last_edited_time: z.string(),
});

export type EntityRow = z.infer<typeof EntityRowSchema>;
