import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { entities } from './entities.js';
import { locations } from './locations.js';
import { transactions } from './transactions.js';

export const homeInventory = sqliteTable(
  'home_inventory',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    notionId: text('notion_id').unique(),
    itemName: text('item_name').notNull(),
    brand: text('brand'),
    model: text('model'),
    itemId: text('item_id'),
    room: text('room'),
    location: text('location'),
    type: text('type'),
    condition: text('condition').default('good'),
    inUse: integer('in_use'),
    deductible: integer('deductible'),
    purchaseDate: text('purchase_date'),
    warrantyExpires: text('warranty_expires'),
    replacementValue: real('replacement_value'),
    resaleValue: real('resale_value'),
    purchaseTransactionId: text('purchase_transaction_id').references(() => transactions.id, {
      onDelete: 'set null',
    }),
    purchasedFromId: text('purchased_from_id').references(() => entities.id, {
      onDelete: 'set null',
    }),
    purchasedFromName: text('purchased_from_name'),
    purchasePrice: real('purchase_price'),
    assetId: text('asset_id').unique(),
    notes: text('notes'),
    locationId: text('location_id').references(() => locations.id, {
      onDelete: 'set null',
    }),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    lastEditedTime: text('last_edited_time').notNull(),
  },
  (table) => [
    uniqueIndex('idx_inventory_asset_id').on(table.assetId),
    index('idx_inventory_name').on(table.itemName),
    index('idx_inventory_location').on(table.locationId),
    index('idx_inventory_type').on(table.type),
    index('idx_inventory_warranty').on(table.warrantyExpires),
  ]
);
