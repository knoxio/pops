/**
 * Cerebrum engram index schema.
 *
 * Engrams are Markdown files on disk; this schema mirrors their frontmatter
 * into SQLite so queries (list, filter by scope, search by tag, reverse-link
 * lookup) can be served without parsing files. The filesystem remains the
 * source of truth — the index is regenerable from `.md` files.
 */
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const engramIndex = sqliteTable(
  'engram_index',
  {
    id: text('id').primaryKey(),
    filePath: text('file_path').notNull().unique(),
    type: text('type').notNull(),
    source: text('source').notNull(),
    status: text('status').notNull(),
    template: text('template'),
    createdAt: text('created_at').notNull(),
    modifiedAt: text('modified_at').notNull(),
    title: text('title').notNull(),
    contentHash: text('content_hash').notNull(),
    wordCount: integer('word_count').notNull(),
    customFields: text('custom_fields'),
  },
  (table) => [
    index('idx_engram_index_type').on(table.type),
    index('idx_engram_index_source').on(table.source),
    index('idx_engram_index_status').on(table.status),
    index('idx_engram_index_created_at').on(table.createdAt),
    index('idx_engram_index_content_hash').on(table.contentHash),
  ]
);

export const engramScopes = sqliteTable(
  'engram_scopes',
  {
    engramId: text('engram_id')
      .notNull()
      .references(() => engramIndex.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
  },
  (table) => [
    unique('uq_engram_scopes_pair').on(table.engramId, table.scope),
    index('idx_engram_scopes_scope').on(table.scope),
  ]
);

export const engramTags = sqliteTable(
  'engram_tags',
  {
    engramId: text('engram_id')
      .notNull()
      .references(() => engramIndex.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (table) => [
    unique('uq_engram_tags_pair').on(table.engramId, table.tag),
    index('idx_engram_tags_tag').on(table.tag),
  ]
);

// target_id intentionally has no FK — links may reference engrams that have not
// yet been indexed (referenced in frontmatter before the target file is
// processed). The indexer reconciles orphaned targets when the target lands.
export const engramLinks = sqliteTable(
  'engram_links',
  {
    sourceId: text('source_id')
      .notNull()
      .references(() => engramIndex.id, { onDelete: 'cascade' }),
    targetId: text('target_id').notNull(),
  },
  (table) => [
    unique('uq_engram_links_pair').on(table.sourceId, table.targetId),
    index('idx_engram_links_target').on(table.targetId),
  ]
);
