import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { comparisonDimensions } from "./comparison-dimensions.js";

export const comparisons = sqliteTable(
  "comparisons",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dimensionId: integer("dimension_id")
      .notNull()
      .references(() => comparisonDimensions.id),
    mediaAType: text("media_a_type").notNull(),
    mediaAId: integer("media_a_id").notNull(),
    mediaBType: text("media_b_type").notNull(),
    mediaBId: integer("media_b_id").notNull(),
    winnerType: text("winner_type").notNull(),
    winnerId: integer("winner_id").notNull(),
    comparedAt: text("compared_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_comparisons_dimension_id").on(table.dimensionId),
    index("idx_comparisons_media_a").on(table.mediaAType, table.mediaAId),
    index("idx_comparisons_media_b").on(table.mediaBType, table.mediaBId),
  ]
);
