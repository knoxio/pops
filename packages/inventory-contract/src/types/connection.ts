/**
 * A named external integration the inventory pillar can talk to —
 * Paperless, a specific scanner, or another asset-tracking source.
 * Mirrors the API response (camelCase) for the inventory pillar.
 *
 * The live persistence layer additionally pins per-integration auth
 * and endpoint columns; the contract pins only the shape downstream
 * consumers need to list connections and toggle their `enabled` state.
 * `type` is a free-form string (e.g. `'paperless'`, `'snipe-it'`) so
 * new integrations can land without bumping the contract.
 */
export interface Connection {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  /** ISO-8601 timestamp. Validated by `ConnectionSchema` via `.datetime()`. */
  lastEditedTime: string;
}
