import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { seasons } from "./seasons.js";

export const episodes = sqliteTable(
  "episodes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    tvdbId: integer("tvdb_id").notNull(),
    episodeNumber: integer("episode_number").notNull(),
    name: text("name"),
    overview: text("overview"),
    airDate: text("air_date"),
    stillPath: text("still_path"),
    voteAverage: real("vote_average"),
    runtime: integer("runtime"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("idx_episodes_tvdb_id").on(table.tvdbId),
    uniqueIndex("idx_episodes_season_number").on(table.seasonId, table.episodeNumber),
    index("idx_episodes_season_id").on(table.seasonId),
  ]
);
