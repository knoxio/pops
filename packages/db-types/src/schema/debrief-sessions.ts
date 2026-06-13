import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { watchHistory } from './watch-history.js';

/**
 * Debrief sessions — one row per (re-)watch tracked by the cerebrum
 * debrief subsystem for post-watch reflection.
 *
 * `mediaType` + `mediaId` are denormalised onto the row (PR #3111
 * Option D step 1, MEDIA exit prep) so the cross-pillar
 * `getDebriefByMedia` read no longer has to inner-join `watch_history`
 * to recover the media tuple. Both columns are nullable for the
 * migration window only: the migration backfills every existing row
 * from `watch_history`, the writer (`logWatchCompletion`) will set
 * them on insert in the follow-up PR, and the cerebrum baseline
 * migration will tighten them to NOT NULL once `debrief_sessions`
 * physically moves to `cerebrum.db`.
 */
export const debriefSessions = sqliteTable(
  'debrief_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    watchHistoryId: integer('watch_history_id')
      .notNull()
      .references(() => watchHistory.id),
    mediaType: text('media_type'),
    mediaId: integer('media_id'),
    status: text('status', { enum: ['pending', 'active', 'complete'] })
      .notNull()
      .default('pending'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index('idx_debrief_sessions_media').on(table.mediaType, table.mediaId)]
);
