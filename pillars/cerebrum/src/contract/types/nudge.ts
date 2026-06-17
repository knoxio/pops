export const NUDGE_STATUSES = ['pending', 'sent', 'dismissed'] as const;

export type NudgeStatus = (typeof NUDGE_STATUSES)[number];

/**
 * A scheduled proactive nudge surfaced by the cerebrum reflex/nudge
 * subsystem. Mirrors the API response (camelCase) for the cerebrum pillar.
 *
 * Contract shape deliberately diverges from the live runtime row
 * (`apps/pops-api/src/modules/cerebrum/nudges/types.ts` + the
 * `nudge_log` table in `@pops/cerebrum-db`): the runtime today carries
 * `type`/`title`/`body`/`engramIds`/`priority`/`action` and a different
 * status vocabulary (`'pending' | 'dismissed' | 'acted' | 'expired'`),
 * none of which are part of the public wire surface this contract pins.
 * The contract collapses the runtime's `title`+`body` into a single
 * `message` and uses a delivery-oriented status vocabulary
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
