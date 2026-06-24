export const NUDGE_STATUSES = ['pending', 'sent', 'dismissed'] as const;

export type NudgeStatus = (typeof NUDGE_STATUSES)[number];

/**
 * A scheduled proactive nudge surfaced by the cerebrum reflex/nudge
 * subsystem. Mirrors the API response (camelCase) for the cerebrum pillar.
 *
 * Contract shape deliberately diverges from the persistence row (the
 * `nudge_log` table under `src/db`): the row carries
 * `type`/`title`/`body`/`engramIds`/`priority`/`action` and a different
 * status vocabulary (`'pending' | 'dismissed' | 'acted' | 'expired'`),
 * none of which are part of the public wire surface this contract pins.
 * The contract collapses the row's `title`+`body` into a single `message`
 * and uses a delivery-oriented status vocabulary
 * (`'pending' | 'sent' | 'dismissed'`). The row mapper translates.
 */
export interface Nudge {
  id: string;
  message: string;
  status: NudgeStatus;
  /** ISO-8601 timestamp. Validated by `NudgeSchema` via `.datetime()`. */
  scheduledFor: string;
  /** ISO-8601 timestamp. Null until the nudge is dispatched. */
  dispatchedAt: string | null;
  /** ISO-8601 timestamp. Validated by `NudgeSchema` via `.datetime()`. */
  lastEditedTime: string;
}
