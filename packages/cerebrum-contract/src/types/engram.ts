/**
 * Pilot entity for `@pops/cerebrum-contract`. This is a deliberate stub
 * shape — id/content/lastEditedTime — sized to exercise the round-trip
 * tests + manifest + OpenAPI generators without committing the contract
 * to the full surface of the live cerebrum domain types. The production
 * shape migrates in a follow-up PRD-153 US-07-style content migration
 * for cerebrum.
 *
 * `lastEditedTime` is an ISO-8601 timestamp validated by `EngramSchema`
 * via `.datetime()`.
 */
export interface Engram {
  id: string;
  content: string;
  /** ISO-8601 timestamp. Validated by `EngramSchema` via `.datetime()`. */
  lastEditedTime: string;
}
