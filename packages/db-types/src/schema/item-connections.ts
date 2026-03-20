import { sqliteTable, text, integer, index, unique, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { homeInventory } from "./inventory.js";

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
    check("chk_item_connections_order", sql`${table.itemAId} < ${table.itemBId}`),
    index("idx_item_connections_a").on(table.itemAId),
    index("idx_item_connections_b").on(table.itemBId),
  ]
);
