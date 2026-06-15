/**
 * An inventory location — a place where items live. Locations form a tree
 * via `parentId` (a null parent marks a root). Mirrors the API response
 * (camelCase) for the inventory pillar.
 *
 * Contract shape is narrower than the live persistence row: the wire
 * field is `sortIndex` (the runtime row calls this `sortOrder`); the
 * contract pins the name downstream consumers should code against.
 * Tree-membership helpers (`children`, `path`) are derived shapes and
 * live outside this base entity.
 */
export interface Location {
  id: string;
  name: string;
  /** Parent location id, or `null` when this is a root. */
  parentId: string | null;
  /** Stable sibling ordering. Non-negative integer. */
  sortIndex: number;
  /** ISO-8601 timestamp. Validated by `LocationSchema` via `.datetime()`. */
  lastEditedTime: string;
}
