/**
 * NOTE: in-monolith consumers of this schema were removed in
 * `chore/remove-debrief-feature` (see
 * `docs/themes/13-pillar-finale/notes/debrief-feature-removal-2026-06.md`).
 * The table is retained for data preservation and future restoration of
 * the debrief feature.
 */
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { debriefSessions } from './debrief-sessions.js';

/**
 * Debrief results — per-session, per-dimension reflection outcome.
 *
 * `dimensionId` and `comparisonId` are soft pointers into
 * `media.db.comparison_dimensions` / `media.db.comparisons` resolved
 * via the URI dispatcher (ADR-026); their schema-level `.references()`
 * clauses are intentionally absent so the cerebrum SQLite file can
 * stand alone (PRD-245 US-01 / audit H7). The intra-cerebrum FK to
 * `debriefSessions` is preserved.
 */
export const debriefResults = sqliteTable('debrief_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id')
    .notNull()
    .references(() => debriefSessions.id),
  dimensionId: integer('dimension_id').notNull(),
  comparisonId: integer('comparison_id'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});
