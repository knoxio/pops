import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { comparisonDimensions } from './comparison-dimensions.js';
import { comparisons } from './comparisons.js';
import { debriefSessions } from './debrief-sessions.js';

export const debriefResults = sqliteTable('debrief_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id')
    .notNull()
    .references(() => debriefSessions.id),
  dimensionId: integer('dimension_id')
    .notNull()
    .references(() => comparisonDimensions.id),
  comparisonId: integer('comparison_id').references(() => comparisons.id),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});
