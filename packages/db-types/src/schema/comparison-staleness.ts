import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const comparisonStaleness = sqliteTable(
  "comparison_staleness",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mediaType: text("media_type").notNull(),
    mediaId: integer("media_id").notNull(),
    staleness: real("staleness").notNull().default(1.0),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [uniqueIndex("idx_comparison_staleness_unique").on(table.mediaType, table.mediaId)]
);
