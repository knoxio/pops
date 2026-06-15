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
export type InventoryRow = typeof homeInventory.$inferSelect;
export type ItemConnectionRow = typeof itemConnections.$inferSelect;
export type ItemDocumentRow = typeof itemDocuments.$inferSelect;
export type ItemFixtureConnectionRow = typeof itemFixtureConnections.$inferSelect;
export type ItemPhotoRow = typeof itemPhotos.$inferSelect;
export type ItemUploadedFileRow = typeof itemUploadedFiles.$inferSelect;
export type LocationRow = typeof locations.$inferSelect;
