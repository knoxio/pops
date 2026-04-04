import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { comparisonDimensions } from "./comparison-dimensions.js";

export const mediaScores = sqliteTable(
  "media_scores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mediaType: text("media_type").notNull(),
    mediaId: integer("media_id").notNull(),
    dimensionId: integer("dimension_id")
      .notNull()
      .references(() => comparisonDimensions.id),
    score: real("score").notNull().default(1500.0),
    comparisonCount: integer("comparison_count").notNull().default(0),
    excluded: integer("excluded").notNull().default(0),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("idx_media_scores_unique").on(table.mediaType, table.mediaId, table.dimensionId),
    index("idx_media_scores_dimension").on(table.dimensionId),
  ]
);
