import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const syncJobResults = sqliteTable(
  'sync_job_results',
  {
    id: text('id').primaryKey(),
    jobType: text('job_type').notNull(),
    status: text('status').notNull(), // "completed" | "failed"
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
    durationMs: integer('duration_ms'),
    progress: text('progress'), // JSON: { processed, total }
    result: text('result'), // JSON: full sync result (shape varies by jobType)
    error: text('error'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index('idx_sync_job_results_type_completed').on(table.jobType, table.completedAt)]
);
