/**
 * `sync_job_results` — cross-pillar BullMQ result table owned by the registry
 * pillar. Created and migrated by `migrations/0060_sync_job_results.sql` and
 * read/written through the registry db handle via `syncResultsService`.
 *
 * The media pillar carries its own independent copy of this table; this is
 * the canonical registry-owned definition.
 */
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const syncJobResults = sqliteTable(
  'sync_job_results',
  {
    id: text('id').primaryKey(),
    jobType: text('job_type').notNull(),
    status: text('status').notNull(),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
    durationMs: integer('duration_ms'),
    progress: text('progress'),
    result: text('result'),
    error: text('error'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index('idx_sync_job_results_type_completed').on(table.jobType, table.completedAt)]
);
