/**
 * A list item in the lists pillar. Mirrors the API response (camelCase).
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
