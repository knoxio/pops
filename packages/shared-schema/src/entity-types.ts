/**
 * Discriminator values for the cross-pillar `entities` table.
 *
 * Lives alongside the `entities` drizzle definition so the table and its
 * allowed `type` values stay a single source of truth (PRD-245 US-07).
 * Relocated from `@pops/db-types` → `@pops/core-db` → here.
 */
export const ENTITY_TYPES = [
  'company',
  'person',
  'government',
  'bank',
  'place',
  'brand',
  'organisation',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
