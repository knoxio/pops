/**
 * Pilot entity for `@pops/inventory-contract`. This is a deliberate stub
 * shape — id/name/location/lastEditedTime — sized to exercise the
 * round-trip tests + manifest + OpenAPI generators without committing
 * the contract to the full 22-field surface of the live
 * `apps/pops-api/src/modules/inventory/items/types.ts` `InventoryItem`
 * type. The production shape migrates in a follow-up PRD-153 US-07-style
 * content migration for inventory.
 *
 * `lastEditedTime` is an ISO-8601 timestamp validated by `ItemSchema`
 * via `.datetime()`. `location` is the free-text location string the
 * live shape exposes (the live shape also carries a separate `locationId`
 * foreign key; that lands with the full migration, not the pilot stub).
 */
export interface Item {
  id: string;
  name: string;
  location: string | null;
  /** ISO-8601 timestamp. Validated by `ItemSchema` via `.datetime()`. */
  lastEditedTime: string;
}
