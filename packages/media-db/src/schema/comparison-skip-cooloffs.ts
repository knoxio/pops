import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { comparisonDimensions } from './comparison-dimensions.js';

export const comparisonSkipCooloffs = sqliteTable(
  'comparison_skip_cooloffs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    dimensionId: integer('dimension_id')
      .notNull()
      .references(() => comparisonDimensions.id),
    mediaAType: text('media_a_type').notNull(),
    mediaAId: integer('media_a_id').notNull(),
    mediaBType: text('media_b_type').notNull(),
    mediaBId: integer('media_b_id').notNull(),
    skipUntil: integer('skip_until').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('idx_comparison_skip_cooloffs_pair').on(
      table.dimensionId,
      table.mediaAType,
      table.mediaAId,
      table.mediaBType,
      table.mediaBId
    ),
  ]
);
