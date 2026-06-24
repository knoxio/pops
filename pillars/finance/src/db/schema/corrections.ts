import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const transactionCorrections = sqliteTable(
  'transaction_corrections',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    descriptionPattern: text('description_pattern').notNull(),
    matchType: text('match_type', { enum: ['exact', 'contains', 'regex'] })
      .notNull()
      .default('exact'),
    entityId: text('entity_id'),
    entityName: text('entity_name'),
    location: text('location'),
    tags: text('tags').notNull().default('[]'),
    transactionType: text('transaction_type', {
      enum: ['purchase', 'transfer', 'income'],
    }),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    confidence: real('confidence').notNull().default(0.5),
    priority: integer('priority').notNull().default(0),
    timesApplied: integer('times_applied').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    lastUsedAt: text('last_used_at'),
  },
  (table) => [
    index('idx_corrections_pattern').on(table.descriptionPattern),
    index('idx_corrections_priority').on(table.priority),
    index('idx_corrections_confidence').on(table.confidence),
    index('idx_corrections_times_applied').on(table.timesApplied),
  ]
);
