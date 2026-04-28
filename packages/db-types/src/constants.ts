/** Shared domain constants derived from the database schema. */
export const ENTITY_TYPES = ['company', 'person', 'place', 'brand', 'organisation'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const WISH_LIST_PRIORITIES = ['Needing', 'Soon', 'One Day', 'Dreaming'] as const;
export type WishListPriority = (typeof WISH_LIST_PRIORITIES)[number];

export const MEDIA_TYPES = ['movie', 'tv_show'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];
