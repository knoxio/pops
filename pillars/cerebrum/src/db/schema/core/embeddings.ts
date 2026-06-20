import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const embeddings = sqliteTable(
  'embeddings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    chunkIndex: integer('chunk_index').notNull().default(0),
    contentHash: text('content_hash').notNull(),
    contentPreview: text('content_preview').notNull(),
    model: text('model').notNull(),
    dimensions: integer('dimensions').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_embeddings_source_chunk').on(
      table.sourceType,
      table.sourceId,
      table.chunkIndex
    ),
    index('idx_embeddings_source_type').on(table.sourceType),
    index('idx_embeddings_content_hash').on(table.contentHash),
  ]
);
