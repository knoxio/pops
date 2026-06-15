/**
 * Pilot entity for `@pops/lists-contract`. This is a deliberate stub
 * shape — id/name/completed/lastEditedTime — sized to exercise the
 * round-trip tests + manifest + OpenAPI generators without committing
 * the contract to the full surface of the live lists domain types. The
 * production shape migrates in a follow-up PRD-153 US-07-style content
 * migration for lists.
 *
 * `lastEditedTime` is an ISO-8601 timestamp validated by `ListItemSchema`
 * via `.datetime()`.
 */
export interface ListItem {
  id: string;
  name: string;
  completed: boolean;
  /** ISO-8601 timestamp. Validated by `ListItemSchema` via `.datetime()`. */
  lastEditedTime: string;
}
