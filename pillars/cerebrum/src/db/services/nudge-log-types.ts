/**
 * Domain types for the nudge_log slice (PRD-084).
 *
 * Live in this package because they describe the persistence layer's
 * input/output shape. The pops-api `apps/pops-api/src/modules/cerebrum/nudges/`
 * module currently has parallel definitions; the cutover PR will flip its
 * imports here.
 */

/** Nudge types: the four detection modes (PRD-084). */
export type NudgeType = 'consolidation' | 'staleness' | 'pattern' | 'insight';

/** Lifecycle states tracked for a persisted nudge. */
export type NudgeStatus = 'pending' | 'dismissed' | 'acted' | 'expired';

/** Delivery urgency. */
export type NudgePriority = 'low' | 'medium' | 'high';

/** Suggested action a nudge can attach. */
export type NudgeActionType = 'consolidate' | 'archive' | 'review' | 'link';

/** Suggested action embedded in a nudge. */
export interface NudgeAction {
  type: NudgeActionType;
  label: string;
  params: Record<string, unknown>;
}

/** A persisted nudge — the core data model of PRD-084. */
export interface Nudge {
  id: string;
  type: NudgeType;
  title: string;
  body: string;
  engramIds: string[];
  priority: NudgePriority;
  status: NudgeStatus;
  createdAt: string;
  expiresAt: string | null;
  actedAt: string | null;
  action: NudgeAction | null;
}

/** A nudge candidate before persistence. */
export interface NudgeCandidate {
  type: NudgeType;
  title: string;
  body: string;
  engramIds: string[];
  priority: NudgePriority;
  expiresAt: string | null;
  action: NudgeAction | null;
}

/**
 * Subset of {@link NudgeThresholds} that the persistence layer needs.
 *
 * The wider thresholds object lives in pops-api today (it pulls defaults
 * from settings); the persistence layer only consults the cooldown
 * window, so we narrow to the relevant fields. The cutover PR will flip
 * pops-api's wider type to extend this one.
 */
export interface NudgePersistenceThresholds {
  /** Hours between nudges of the same type for the same engrams. */
  nudgeCooldownHours: number;
}
