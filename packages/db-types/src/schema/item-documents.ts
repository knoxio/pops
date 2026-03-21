import {
  sqliteTable,
  text,
  integer,
  index,
  unique,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { homeInventory } from "./inventory.js";

export const itemDocuments = sqliteTable(
  "item_documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: text("item_id")
      .notNull()
      .references(() => homeInventory.id, { onDelete: "cascade" }),
    paperlessDocumentId: integer("paperless_document_id").notNull(),
    documentType: text("document_type").notNull(),
    title: text("title"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    unique("uq_item_documents_pair").on(
      table.itemId,
      table.paperlessDocumentId,
    ),
    index("idx_item_documents_item").on(table.itemId),
    index("idx_item_documents_doc").on(table.paperlessDocumentId),
  ],
);
