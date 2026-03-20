import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const locations = sqliteTable(
  "locations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    lastEditedTime: text("last_edited_time").notNull(),
  },
  (table) => [
    index("idx_locations_parent").on(table.parentId),
    index("idx_locations_name").on(table.name),
  ]
);
