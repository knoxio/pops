import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { homeInventory } from "./inventory.js";

/**
 * Bidirectional item connections — junction table for physical links between
 * inventory items (e.g. HDMI cable → TV, power board → router).
 *
 * Application layer enforces itemAId < itemBId ordering to prevent duplicate
 * rows for the same connection. The unique constraint is the safety net.
 * When querying connections for an item, check both columns.
 */
export const itemConnections = sqliteTable(
  "item_connections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemAId: text("item_a_id")
      .notNull()
      .references(() => homeInventory.id, { onDelete: "cascade" }),
    itemBId: text("item_b_id")
      .notNull()
      .references(() => homeInventory.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    unique("uq_item_connections_pair").on(table.itemAId, table.itemBId),
    index("idx_item_connections_a").on(table.itemAId),
    index("idx_item_connections_b").on(table.itemBId),
  ]
);
