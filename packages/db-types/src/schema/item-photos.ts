import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { homeInventory } from "./inventory.js";

/**
 * Photo references for inventory items.
 *
 * filePath is relative to the inventory images directory
 * (e.g. items/{item_id}/photo_001.jpg). sortOrder controls display
 * ordering — the first photo (sortOrder=0) is the primary/thumbnail.
 */
export const itemPhotos = sqliteTable(
  "item_photos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: text("item_id")
      .notNull()
      .references(() => homeInventory.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    caption: text("caption"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_item_photos_item").on(table.itemId)]
);
