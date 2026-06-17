import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const tvShows = sqliteTable(
  'tv_shows',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tvdbId: integer('tvdb_id').notNull(),
    name: text('name').notNull(),
    originalName: text('original_name'),
    overview: text('overview'),
    firstAirDate: text('first_air_date'),
    lastAirDate: text('last_air_date'),
    status: text('status'),
    originalLanguage: text('original_language'),
    numberOfSeasons: integer('number_of_seasons'),
    numberOfEpisodes: integer('number_of_episodes'),
    episodeRunTime: integer('episode_run_time'),
    posterPath: text('poster_path'),
    backdropPath: text('backdrop_path'),
    logoPath: text('logo_path'),
    posterOverridePath: text('poster_override_path'),
    discoverRatingKey: text('discover_rating_key'),
    voteAverage: real('vote_average'),
    voteCount: integer('vote_count'),
    genres: text('genres'), // JSON array
    networks: text('networks'), // JSON array
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('idx_tv_shows_tvdb_id').on(table.tvdbId),
    index('idx_tv_shows_name').on(table.name),
    index('idx_tv_shows_first_air_date').on(table.firstAirDate),
  ]
);
