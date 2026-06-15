import { sql } from 'drizzle-orm';
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { locations } from './locations.js';

export const fixtures = sqliteTable(
  'fixtures',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    type: text('type').notNull(),
    locationId: text('location_id').references(() => locations.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    lastEditedTime: text('last_edited_time').notNull(),
  },
  (table) => [
    index('idx_fixtures_location').on(table.locationId),
    index('idx_fixtures_type').on(table.type),
    index('idx_fixtures_name').on(table.name),
  ]
);
