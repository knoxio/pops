/**
 * `kind` and `ref_kind` are closed enums backed by CHECK constraints — adding
 * a value means extending the CHECK in a migration, not just this list.
 */
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const lists = sqliteTable(
  'lists',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['shopping', 'packing', 'todo', 'generic'] }).notNull(),
    ownerApp: text('owner_app').notNull(),
    archivedAt: text('archived_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_lists_kind').on(t.kind), index('idx_lists_owner_app').on(t.ownerApp)]
);

export const listItems = sqliteTable(
  'list_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    listId: integer('list_id')
      .notNull()
      .references(() => lists.id),
    position: integer('position').notNull().default(0),
    label: text('label').notNull(),
    qty: real('qty'),
    unit: text('unit'),
    refKind: text('ref_kind', { enum: ['free', 'ingredient', 'variant', 'recipe', 'custom'] })
      .notNull()
      .default('free'),
    refId: integer('ref_id'),
    checked: integer('checked').notNull().default(0),
    checkedAt: text('checked_at'),
    dueAt: text('due_at'),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index('idx_list_items_list').on(t.listId),
    index('idx_list_items_checked').on(t.listId, t.checked),
    // The migration creates this index partial (WHERE ref_id IS NOT NULL);
    // drizzle-kit can't express the WHERE clause, so the migration's index
    // diverges from this schema definition.
    index('idx_list_items_ref').on(t.refKind, t.refId),
  ]
);
