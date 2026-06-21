/**
 * Discriminator values for the core-owned `entities` table.
 *
 * Co-located with the `entities` drizzle definition so the table and its
 * allowed `type` values stay a single source of truth.
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
