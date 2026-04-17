import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const budgets = sqliteTable(
  'budgets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    notionId: text('notion_id').unique(),
    category: text('category').notNull(),
    // NOTE: schema.ts defines period as NOT NULL, but the actual DB (and test fixtures)
    // allow NULL periods. Service code treats period as nullable. Drizzle schema matches
    // runtime behavior, not the stricter schema.ts definition.
    period: text('period'),
    amount: real('amount'),
    active: integer('active').notNull().default(1),
    notes: text('notes'),
    lastEditedTime: text('last_edited_time').notNull(),
  },
  (table) => [
    // SQLite NULL != NULL in standard UNIQUE constraints, so two rows with the same
    // category and NULL period would not conflict. COALESCE with a sentinel value
    // ensures NULL periods are treated as equal for uniqueness purposes.
    // char(0) (NUL byte) cannot appear in user-supplied text, eliminating
    // any risk of a real period value colliding with the NULL sentinel.
    uniqueIndex('idx_budgets_category_period').on(
      table.category,
      sql`COALESCE(${table.period}, char(0))`
    ),
  ]
);
