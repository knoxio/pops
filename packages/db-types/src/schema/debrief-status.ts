import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { comparisonDimensions } from './comparison-dimensions.js';

export const debriefStatus = sqliteTable(
  'debrief_status',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mediaType: text('media_type').notNull(),
    mediaId: integer('media_id').notNull(),
    dimensionId: integer('dimension_id')
      .notNull()
      .references(() => comparisonDimensions.id),
    debriefed: integer('debriefed').notNull().default(0),
    dismissed: integer('dismissed').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    uniqueMediaDimension: uniqueIndex('debrief_status_media_dimension_idx').on(
      table.mediaType,
      table.mediaId,
      table.dimensionId
    ),
  })
);
