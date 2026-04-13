import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { tvShows } from './tv-shows.js';

export const seasons = sqliteTable(
  'seasons',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tvShowId: integer('tv_show_id')
      .notNull()
      .references(() => tvShows.id, { onDelete: 'cascade' }),
    tvdbId: integer('tvdb_id').notNull(),
    seasonNumber: integer('season_number').notNull(),
    name: text('name'),
    overview: text('overview'),
    posterPath: text('poster_path'),
    airDate: text('air_date'),
    episodeCount: integer('episode_count'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('idx_seasons_tvdb_id').on(table.tvdbId),
    uniqueIndex('idx_seasons_show_number').on(table.tvShowId, table.seasonNumber),
    index('idx_seasons_tv_show_id').on(table.tvShowId),
  ]
);
