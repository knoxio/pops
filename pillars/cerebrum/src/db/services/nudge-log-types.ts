/**
 * Domain types for the nudge_log slice (proactive-nudges).
 *
 * They describe the persistence layer's input/output shape.
 */

/** Nudge types: the four detection modes. */
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

/** A persisted nudge — the core data model of the nudge subsystem. */
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
 * The thresholds the persistence layer needs — narrowed to the cooldown
 * window, the only field this layer consults. The wider thresholds object
 * (with settings-sourced defaults) lives in the nudges domain module.
 */
export interface NudgePersistenceThresholds {
  /** Hours between nudges of the same type for the same engrams. */
  nudgeCooldownHours: number;
}
