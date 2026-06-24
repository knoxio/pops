/**
 * Cerebrum plexus adapter registry schema.
 *
 * `plexus_adapters` rows describe each external integration the cerebrum
 * pillar is wired up to (Notion, Linear, e-mail, etc.) and `plexus_filters`
 * holds the per-adapter include/exclude regex rules the lifecycle manager
 * applies to incoming items.
 */
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const plexusAdapters = sqliteTable(
  'plexus_adapters',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    status: text('status').notNull().default('registered'),
    config: text('config'),
    lastHealth: text('last_health'),
    lastError: text('last_error'),
    ingestedCount: integer('ingested_count').notNull().default(0),
    emittedCount: integer('emitted_count').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_plexus_adapters_name').on(table.name),
    index('idx_plexus_adapters_status').on(table.status),
  ]
);

export const plexusFilters = sqliteTable(
  'plexus_filters',
  {
    id: text('id').primaryKey(),
    adapterId: text('adapter_id')
      .notNull()
      .references(() => plexusAdapters.id, { onDelete: 'cascade' }),
    filterType: text('filter_type').notNull(),
    field: text('field').notNull(),
    pattern: text('pattern').notNull(),
    enabled: integer('enabled').notNull().default(1),
  },
  (table) => [index('idx_plexus_filters_adapter_id').on(table.adapterId)]
);
