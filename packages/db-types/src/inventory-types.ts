/**
 * Drizzle `InferSelectModel<T>` aliases for inventory-owned tables.
 *
 * Split out of `index.ts` to keep that file under the file-size lint
 * cap once `@pops/db-types` re-exports the inventory schemas from
 * `@pops/inventory-db` (PRD-245 US-02). Public surface stays unchanged:
 * `index.ts` re-exports `* from './inventory-types.js'`.
 */
import type { InferSelectModel } from 'drizzle-orm';

import type {
  fixtures,
  homeInventory,
  itemConnections,
  itemDocuments,
  itemFixtureConnections,
  itemPhotos,
  itemUploadedFiles,
  locations,
} from '@pops/inventory-db';

export type InventoryRow = InferSelectModel<typeof homeInventory>;
export type LocationRow = InferSelectModel<typeof locations>;
export type FixtureRow = InferSelectModel<typeof fixtures>;
export type ItemConnectionRow = InferSelectModel<typeof itemConnections>;
export type ItemFixtureConnectionRow = InferSelectModel<typeof itemFixtureConnections>;
export type ItemDocumentRow = InferSelectModel<typeof itemDocuments>;
export type ItemPhotoRow = InferSelectModel<typeof itemPhotos>;
export type ItemUploadedFileRow = InferSelectModel<typeof itemUploadedFiles>;
