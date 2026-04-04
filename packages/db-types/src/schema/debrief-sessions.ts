import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { watchHistory } from "./watch-history.js";

export const debriefSessions = sqliteTable("debrief_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  watchHistoryId: integer("watch_history_id")
    .notNull()
    .references(() => watchHistory.id),
  status: text("status", { enum: ["pending", "active", "complete"] })
    .notNull()
    .default("pending"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
