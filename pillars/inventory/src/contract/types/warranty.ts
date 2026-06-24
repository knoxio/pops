/**
 * A warranty attached to an inventory item, in camelCase as the inventory
 * pillar serves it. `provider` is nullable because not every warranty
 * exposes a known vendor name. Kept structurally in sync with
 * `WarrantySchema` (`../schemas/warranty.ts`) by the round-trip tests.
 */
export interface Warranty {
  id: string;
  itemId: string;
  /** ISO-8601 timestamp. Validated by `WarrantySchema` via `.datetime()`. */
  expiresAt: string;
  provider: string | null;
  /** ISO-8601 timestamp. Validated by `WarrantySchema` via `.datetime()`. */
  lastEditedTime: string;
}
