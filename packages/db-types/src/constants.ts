/** Shared domain constants derived from the database schema. */
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

export const WISH_LIST_PRIORITIES = ['Needing', 'Soon', 'One Day', 'Dreaming'] as const;
export type WishListPriority = (typeof WISH_LIST_PRIORITIES)[number];

export const MEDIA_TYPES = ['movie', 'tv_show'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/**
 * Allowed values for `home_inventory.condition`. Stored title-case in the DB
 * but matched case-insensitively in the items list filter, so the values can
 * be used directly in both the edit form and the filter dropdown without
 * casing transforms.
 */
export const INVENTORY_CONDITIONS = ['Excellent', 'New', 'Good', 'Fair', 'Poor', 'Broken'] as const;
export type InventoryCondition = (typeof INVENTORY_CONDITIONS)[number];
