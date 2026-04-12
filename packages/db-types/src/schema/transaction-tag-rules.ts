import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { entities } from './entities.js';

export const transactionTagRules = sqliteTable(
  'transaction_tag_rules',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    descriptionPattern: text('description_pattern').notNull(),
    matchType: text('match_type', { enum: ['exact', 'contains', 'regex'] })
      .notNull()
      .default('exact'),
    /** Optional group scoping: apply only for a specific entity. */
    entityId: text('entity_id').references(() => entities.id, { onDelete: 'set null' }),
    tags: text('tags').notNull().default('[]'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    // CHECK: confidence >= 0.0 AND confidence <= 1.0
    confidence: real('confidence').notNull().default(0.5),
    priority: integer('priority').notNull().default(0),
    timesApplied: integer('times_applied').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    lastUsedAt: text('last_used_at'),
  },
  (table) => [
    index('idx_tag_rules_pattern').on(table.descriptionPattern),
    index('idx_tag_rules_entity_id').on(table.entityId),
    index('idx_tag_rules_priority').on(table.priority),
    index('idx_tag_rules_confidence').on(table.confidence),
    index('idx_tag_rules_times_applied').on(table.timesApplied),
  ]
);
