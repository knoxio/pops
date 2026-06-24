/**
 * An inventory item in the inventory pillar's contract. `location` is a
 * free-text location string. Kept structurally in sync with `ItemSchema`
 * (`../schemas/item.ts`) by the round-trip tests.
 */
export interface Item {
  id: string;
  name: string;
  location: string | null;
  /** ISO-8601 timestamp. Validated by `ItemSchema` via `.datetime()`. */
  lastEditedTime: string;
}
