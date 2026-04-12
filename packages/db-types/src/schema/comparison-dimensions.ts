import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const comparisonDimensions = sqliteTable(
  'comparison_dimensions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    active: integer('active').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
    weight: real('weight').notNull().default(1.0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [uniqueIndex('idx_comparison_dimensions_name').on(table.name)]
);
