/**
 * Local copy of the core-owned `entities` table.
 *
 * The `entities` table is canonically owned by core, but finance persists
 * its own physical copy in the finance SQLite (separate DB file, no shared
 * data, no cross-pillar FK) for the entity-usage rollup that joins finance
 * `transactions`. This definition must stay byte-compatible with core's
 * `entities` so the two physical schemas agree.
 */
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const ENTITY_TYPES = [
  'company',
  'person',
  'government',
  'bank',
  'place',
  'brand',
  'organisation',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const entities = sqliteTable(
  'entities',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    notionId: text('notion_id').unique(),
    name: text('name').notNull(),
    type: text('type').notNull().default('company'),
    abn: text('abn'),
    aliases: text('aliases'),
    defaultTransactionType: text('default_transaction_type'),
    defaultTags: text('default_tags'),
    notes: text('notes'),
    lastEditedTime: text('last_edited_time').notNull(),
    ownerUri: text('owner_uri'),
    ownerUriStaleAt: text('owner_uri_stale_at'),
  },
  (table) => [index('idx_entities_owner_uri').on(table.ownerUri)]
);
