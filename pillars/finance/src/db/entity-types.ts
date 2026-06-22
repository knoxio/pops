/**
 * The entity (contact) discriminator set.
 *
 * Entities are owned by the contacts pillar; finance keeps no mirror table.
 * This enum is still finance-local because it constrains finance wire shapes
 * (`rest-entity-usage`, `rest-imports-schemas`) — it mirrors the contacts
 * `ENTITY_TYPES` set byte-for-byte (`pillars/contacts/src/entities/model.rs`).
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
