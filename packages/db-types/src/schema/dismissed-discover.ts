import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const dismissedDiscover = sqliteTable("dismissed_discover", {
  tmdbId: integer("tmdb_id").primaryKey(),
  dismissedAt: text("dismissed_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
