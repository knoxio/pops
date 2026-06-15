import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { homeInventory } from './inventory.js';

/**
 * Per-item directly-uploaded files (PDFs, images, plain-text receipts, etc.).
 *
 * This is a parallel sibling to `item_documents`, which is reserved for
 * Paperless-ngx links (`paperless_document_id` mandatory there). Direct uploads
 * have no Paperless ID and need their own filesystem-backed columns
 * (`file_path`, `file_name`, `mime_type`, `file_size`), so a dedicated table
 * keeps the two integrations independent and avoids retrofitting nullable
 * columns onto the existing schema.
 */
export const itemUploadedFiles = sqliteTable(
  'item_uploaded_files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: text('item_id')
      .notNull()
      .references(() => homeInventory.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    filePath: text('file_path').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    uploadedAt: text('uploaded_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index('idx_item_uploaded_files_item').on(table.itemId)]
);
