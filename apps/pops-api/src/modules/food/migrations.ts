/**
 * Migration tags owned by the `food` module. Append in on-disk filename
 * order — the runner applies them in this order.
 */
import { drizzleMigrations } from '../../db/load-drizzle-migration.js';

import type { MigrationDescriptor } from '@pops/types';

export const foodMigrationTags: readonly string[] = [
  '0058_high_sentinel',
  '0059_useful_hiroim',
  '0060_familiar_leo',
  '0061_shocking_skreet',
  '0063_bumpy_wolverine',
  '0064_peaceful_magma',
  '0065_prd_116_recipe_compile',
  '0066_prd_123_conversions',
  // PRD-125 amendment to PRD-110 — error_code/error_message/attempts columns on
  // ingest_sources (persists failure detail past BullMQ TTL).
  '0067_prd_125_ingest_error_columns',
  // PRD-136 — recipe_version_rejections + ingest_sources.reviewed_at for the
  // inbox approve/reject flow.
  '0068_prd_136_inbox_review',
  // PRD-145 — batches.deleted_at soft-delete column.
  '0069_prd_145_batches_deleted_at',
];

export const foodMigrations: readonly MigrationDescriptor[] = drizzleMigrations(foodMigrationTags);
