import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { rotationSources } from './rotation-sources.js';

export const rotationCandidates = sqliteTable(
  'rotation_candidates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sourceId: integer('source_id')
      .notNull()
      .references(() => rotationSources.id, { onDelete: 'cascade' }),
    tmdbId: integer('tmdb_id').notNull(),
    title: text('title').notNull(),
    year: integer('year'),
    rating: real('rating'),
    posterPath: text('poster_path'),
    status: text('status').notNull().default('pending'), // 'pending' | 'added' | 'skipped' | 'excluded'
    discoveredAt: text('discovered_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('idx_rotation_candidates_tmdb_id').on(table.tmdbId),
    index('idx_rotation_candidates_source_id').on(table.sourceId),
    index('idx_rotation_candidates_status').on(table.status),
  ]
);
