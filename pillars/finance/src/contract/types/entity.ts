/**
 * A finance entity (counterparty) — a vendor, employer, or person that
 * appears on the other side of a transaction. Mirrors the API response
 * (camelCase) for the finance pillar.
 *
 * The runtime persistence row carries additional fields (`type`, `abn`,
 * `defaultTransactionType`, etc.); the contract pins only the shape
 * downstream consumers need to render and reference an entity.
 */
export interface Entity {
  id: string;
  name: string;
  /**
   * Alternate names this entity is also known by. Empty array when the
   * entity has no aliases. Order is preserved from the source row.
   */
  aliases: readonly string[];
  /** ISO-8601 timestamp. Validated by `EntitySchema` via `.datetime()`. */
  lastEditedTime: string;
}
