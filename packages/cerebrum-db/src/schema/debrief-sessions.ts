/**
 * NOTE: in-monolith consumers of this schema were removed in
 * `chore/remove-debrief-feature` (see
 * `docs/themes/13-pillar-finale/notes/debrief-feature-removal-2026-06.md`).
 * The table is retained for data preservation and future restoration of
 * the debrief feature.
 */
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
 *
 * `watchHistoryId` is a soft pointer into `media.db.watch_history`
 * resolved via the URI dispatcher (ADR-026); the schema-level
 * `.references()` clause is intentionally absent so the cerebrum
 * SQLite file can stand alone (PRD-245 US-01 / audit H7).
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
