export const AGENDA_ITEM_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;

export type AgendaItemStatus = (typeof AGENDA_ITEM_STATUSES)[number];

/**
 * A single agenda entry — a scheduled item on a calendar-style view. The
 * shape mirrors the API response (camelCase) for the lists pillar.
 *
 * `scheduledDate` is a date-only (`YYYY-MM-DD`) — agenda items are
 * day-bound, not timestamped, so the schema uses `z.string().date()` not
 * `.datetime()`. `lastEditedTime` remains a full ISO-8601 timestamp.
 */
export interface AgendaItem {
  id: string;
  title: string;
  /** ISO-8601 date (no time). Validated by `AgendaItemSchema` via `.date()`. */
  scheduledDate: string;
  status: AgendaItemStatus;
  notes: string | null;
  /** ISO-8601 timestamp. Validated by `AgendaItemSchema` via `.datetime()`. */
  lastEditedTime: string;
}
