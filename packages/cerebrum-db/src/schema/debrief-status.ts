/**
 * NOTE: in-monolith consumers of this schema were removed in
 * `chore/remove-debrief-feature` (see
 * `docs/themes/13-pillar-finale/notes/debrief-feature-removal-2026-06.md`).
 * The table is retained for data preservation and future restoration of
 * the debrief feature.
 */
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Debrief status — per (media tuple, dimension) row tracking whether
 * the debrief flow has been completed or dismissed.
 *
 * `dimensionId` is a soft pointer into `media.db.comparison_dimensions`
 * resolved via the URI dispatcher (ADR-026); the schema-level
 * `.references()` clause is intentionally absent so the cerebrum
 * SQLite file can stand alone (PRD-245 US-01 / audit H7).
 */
export const debriefStatus = sqliteTable(
  'debrief_status',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mediaType: text('media_type').notNull(),
    mediaId: integer('media_id').notNull(),
    dimensionId: integer('dimension_id').notNull(),
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
