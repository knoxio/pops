import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { locations } from './locations.js';

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
    purchaseTransactionId: text('purchase_transaction_id'),
    /**
     * Soft cross-pillar reference to the owning finance pillar's transaction.
     * Shape: `pops://finance/transaction/<id>`. Resolution is deferred to the
     * nightly reconciliation cron — never read-time. NULL when no purchase
     * transaction is linked or when the legacy `purchase_transaction_id` could
     * not be promoted by the backfill.
     */
    purchaseTransactionUri: text('purchase_transaction_uri'),
    /**
     * Timestamp set by the reconciliation cron when the URI no longer
     * resolves on the owning pillar. Existence is best-effort: a row stays
     * intact even after its target 404s; consumers branch on `staleAt`
     * instead of deleting.
     */
    purchaseTransactionStaleAt: text('purchase_transaction_stale_at'),
    purchasedFromId: text('purchased_from_id'),
    purchasedFromName: text('purchased_from_name'),
    purchasePrice: real('purchase_price'),
    /**
     * Soft cross-pillar reference to the user/scope owned by the `registry`
     * pillar (`core` is the legacy URI namespace/alias). Shape:
     * `pops://core/user/<email>`. Same reconciliation semantics as
     * `purchaseTransactionUri`.
     */
    ownerUri: text('owner_uri'),
    /** Stale marker for `ownerUri`. See `purchaseTransactionStaleAt`. */
    ownerStaleAt: text('owner_stale_at'),
    // Uniqueness is enforced via the explicit `idx_inventory_asset_id`
    // unique index below — `.unique()` here would produce a second,
    // redundant unique index (`home_inventory_asset_id_unique`) that
    // doubles write cost and on-disk footprint for zero functional gain.
    assetId: text('asset_id'),
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
    index('idx_inventory_purchase_transaction_uri').on(table.purchaseTransactionUri),
    index('idx_inventory_owner_uri').on(table.ownerUri),
  ]
);
