import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { fixtures } from './fixtures.js';
import { homeInventory } from './inventory.js';

export const itemFixtureConnections = sqliteTable(
  'item_fixture_connections',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: text('item_id')
      .notNull()
      .references(() => homeInventory.id, { onDelete: 'cascade' }),
    fixtureId: text('fixture_id')
      .notNull()
      .references(() => fixtures.id, { onDelete: 'cascade' }),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    unique('uq_item_fixture_connections_pair').on(table.itemId, table.fixtureId),
    index('idx_item_fixture_conn_item').on(table.itemId),
    index('idx_item_fixture_conn_fixture').on(table.fixtureId),
  ]
);
