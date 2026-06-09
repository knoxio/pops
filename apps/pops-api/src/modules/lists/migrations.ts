/**
 * Migration tags owned by the `lists` module.
 *
 * Append a tag here when a new lists schema PRD lands its generated drizzle
 * migration. Order matches the on-disk filename order, which is the order
 * the runner applies them.
 *
 * See PRD-101 US-09 for the runtime filter contract and PRD-112 for the
 * schema spec.
 */
import { drizzleMigrations } from '../../db/load-drizzle-migration.js';

import type { MigrationDescriptor } from '@pops/types';

export const listsMigrationTags: readonly string[] = [
  // PRD-112 — lists + list_items.
  '0062_chemical_donald_blake',
];

export const listsMigrations: readonly MigrationDescriptor[] =
  drizzleMigrations(listsMigrationTags);
