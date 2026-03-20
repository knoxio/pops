import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const watchHistory = sqliteTable(
  "watch_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mediaType: text("media_type", { enum: ["movie", "episode"] }).notNull(),
    mediaId: integer("media_id").notNull(),
    watchedAt: text("watched_at").notNull().default(sql`(datetime('now'))`),
    completed: integer("completed").notNull().default(1),
  },
  (table) => [
    index("idx_watch_history_media").on(table.mediaType, table.mediaId),
    index("idx_watch_history_watched_at").on(table.watchedAt),
  ]
);
