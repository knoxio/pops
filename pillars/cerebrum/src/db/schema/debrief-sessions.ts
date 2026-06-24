import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Debrief sessions — one row per (re-)watch tracked by the cerebrum
 * debrief subsystem for post-watch reflection.
 *
 * `mediaType` + `mediaId` are denormalised onto the row so the
 * cross-pillar `getDebriefByMedia` read does not have to inner-join the
 * media pillar's `watch_history` to recover the media tuple.
 *
 * `watchHistoryId` is a soft pointer into the media pillar's
 * `watch_history` resolved via the URI dispatcher (ADR-026); the
 * schema-level `.references()` clause is intentionally absent so the
 * cerebrum SQLite file can stand alone.
 */
export const debriefSessions = sqliteTable(
  'debrief_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    watchHistoryId: integer('watch_history_id').notNull(),
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
