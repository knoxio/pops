/**
 * Migration tags owned by the `inventory` module.
 *
 * Covers home_inventory items, locations, item_connections, item_documents,
 * and direct-upload file storage.
 *
 * See PRD-101 US-09 for the runtime filter contract.
 */
import { drizzleMigrations } from '../../db/load-drizzle-migration.js';

import type { MigrationDescriptor } from '@pops/types';

export const inventoryMigrationTags: readonly string[] = [
  // locations.
  '0005_fancy_crystal',
  // home_inventory columns (asset_id, notes, location_id).
  '0006_motionless_speed_demon',
  // item_connections.
  '0007_broad_arclight',
  // item_documents (paperless link table).
  '0008_tough_nick_fury',
  // item_uploaded_files (direct upload).
  '0037_item_uploaded_files',
];

export const inventoryMigrations: readonly MigrationDescriptor[] =
  drizzleMigrations(inventoryMigrationTags);
