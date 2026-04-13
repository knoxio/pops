import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const movies = sqliteTable(
  'movies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tmdbId: integer('tmdb_id').notNull(),
    imdbId: text('imdb_id'),
    title: text('title').notNull(),
    originalTitle: text('original_title'),
    overview: text('overview'),
    tagline: text('tagline'),
    releaseDate: text('release_date'),
    runtime: integer('runtime'),
    status: text('status'),
    originalLanguage: text('original_language'),
    budget: integer('budget'),
    revenue: integer('revenue'),
    posterPath: text('poster_path'),
    backdropPath: text('backdrop_path'),
    logoPath: text('logo_path'),
    posterOverridePath: text('poster_override_path'),
    discoverRatingKey: text('discover_rating_key'),
    voteAverage: real('vote_average'),
    voteCount: integer('vote_count'),
    genres: text('genres'), // JSON array
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    // Rotation fields (PRD-070)
    rotationStatus: text('rotation_status', { enum: ['leaving', 'protected'] }),
    rotationExpiresAt: text('rotation_expires_at'),
    rotationMarkedAt: text('rotation_marked_at'),
  },
  (table) => [
    index('idx_movies_rotation_status').on(table.rotationStatus),
    uniqueIndex('idx_movies_tmdb_id').on(table.tmdbId),
    index('idx_movies_title').on(table.title),
    index('idx_movies_release_date').on(table.releaseDate),
  ]
);
