/**
 * A warranty attached to an inventory item. Mirrors the API response
 * (camelCase) for the inventory pillar.
 *
 * The live persistence layer currently denormalises `warrantyExpires`
 * onto the item row; this contract pins the intended shape downstream
 * consumers should code against once the warranty migrates to its own
 * entity. `provider` is nullable because not every warranty exposes
 * a known vendor name.
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
