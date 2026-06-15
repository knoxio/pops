/**
 *   lists       — list header (name, kind, owner_app, archive)
 *   list_items  — polymorphic items pointing at lists.id, optionally back
 *                 to an ingredient / variant / recipe (or owner-app custom ref)
 *
 * The `kind` and `ref_kind` enums are intentionally small + closed —
 * adding a value means extending the CHECK in a migration.
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
    // Partial index on (ref_kind, ref_id) — see migration; drizzle-kit can't
    // express the WHERE clause.
    index('idx_list_items_ref').on(t.refKind, t.refId),
  ]
);
