/**
 * Glia trust-graduation domain types for the cerebrum pillar.
 *
 * The action / trust-state / enum shapes are owned by the pillar data-access
 * layer (`../../../db/index.js`) and re-exported here so the glia module's
 * orchestration code (action service, trust machine, digest) imports a single
 * surface. The graduation-threshold + transition types are pure domain
 * orchestration concerns that never touch the wire or the DB, so they live
 * here rather than in the data package.
 */
export {
  ACTION_STATUSES,
  ACTION_TYPES,
  TRUST_PHASES,
  USER_DECISIONS,
  type ActionListFilters,
  type ActionStatus,
  type ActionType,
  type GliaAction,
  type GliaTrustState,
  type TrustPhase,
  type UserDecision,
} from '../../../db/index.js';

import type { ActionType } from '../../../db/index.js';

/** Input for creating a new action. */
export interface CreateActionInput {
  actionType: ActionType;
  affectedIds: string[];
  rationale: string;
  payload?: unknown;
}

/** Configurable graduation thresholds (ADR-021). */
export interface GraduationThresholds {
  /** Minimum approved actions to graduate from propose to act_report. */
  proposeToActReportMinApproved: number;
  /** Maximum rejection rate (0.0-1.0) to graduate from propose to act_report. */
  proposeToActReportMaxRejectionRate: number;
  /** Minimum days in act_report phase to graduate to silent. */
  actReportToSilentMinDays: number;
  /** Maximum reverts in demotion window before demoting to propose. */
  demotionRevertThreshold: number;
  /** Rolling window in days for counting reverts for demotion. */
  demotionWindowDays: number;
}
