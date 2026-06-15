/**
 * Minimal `entities` drizzle table object used by the finance imports
 * persistence helpers.
 *
 * The canonical `entities` schema lives in `@pops/db-types` today and will
 * relocate to `@pops/core-db` as part of PRD-245 US-07. This file mirrors
 * the columns finance-db actually queries (`id`, `name`, `aliases`,
 * `lastEditedTime`) so that this package does not need a workspace
 * dependency on `@pops/db-types` — which would create a literal package
 * cycle once db-types adds `@pops/finance-db` to its re-export shim.
 *
 * The shadow is intentionally schema-equivalent (same SQL column names
 * and types) so drizzle queries against either object compile against
 * the same underlying SQLite table at runtime. The pillar-isolation
 * audit (H6/H7) notes that cross-pillar FKs were already moot at runtime
 * because each pillar reads its own SQLite file — finance services that
 * still resolve entities in-process get the columns they need here and
 * the duplication clears once US-07 lands the core relocation.
 */
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const entities = sqliteTable('entities', {
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
});
