/**
 * Public `Row` aliases for the inventory-owned tables.
 *
 * Centralised here so consumers can `import type { LocationRow } from
 * '@pops/inventory-db'` without reaching into a service module. The
 * underlying tables live in `./schema/*.ts` (PRD-245 US-02).
 */
import type {
  fixtures,
  homeInventory,
  itemConnections,
  itemDocuments,
  itemFixtureConnections,
  itemPhotos,
  itemUploadedFiles,
  locations,
} from './schema.js';

export type FixtureRow = typeof fixtures.$inferSelect;
export type FixtureInsert = typeof fixtures.$inferInsert;
export type InventoryRow = typeof homeInventory.$inferSelect;
export type InventoryInsert = typeof homeInventory.$inferInsert;
export type ItemConnectionRow = typeof itemConnections.$inferSelect;
export type ItemConnectionInsert = typeof itemConnections.$inferInsert;
export type ItemDocumentRow = typeof itemDocuments.$inferSelect;
export type ItemDocumentInsert = typeof itemDocuments.$inferInsert;
export type ItemFixtureConnectionRow = typeof itemFixtureConnections.$inferSelect;
export type ItemFixtureConnectionInsert = typeof itemFixtureConnections.$inferInsert;
export type ItemPhotoRow = typeof itemPhotos.$inferSelect;
export type ItemPhotoInsert = typeof itemPhotos.$inferInsert;
export type ItemUploadedFileRow = typeof itemUploadedFiles.$inferSelect;
export type ItemUploadedFileInsert = typeof itemUploadedFiles.$inferInsert;
export type LocationRow = typeof locations.$inferSelect;
export type LocationInsert = typeof locations.$inferInsert;

/**
 * Allowed values for `home_inventory.condition`. Stored title-case in the DB
 * but matched case-insensitively in the items list filter, so the values can
 * be used directly in both the edit form and the filter dropdown without
 * casing transforms. Relocated from `@pops/db-types/constants` per
 * PRD-245 US-08.
 */
export const INVENTORY_CONDITIONS = ['Excellent', 'New', 'Good', 'Fair', 'Poor', 'Broken'] as const;
export type InventoryCondition = (typeof INVENTORY_CONDITIONS)[number];
