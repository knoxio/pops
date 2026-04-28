/**
 * Glia trust graduation types.
 *
 * Shared types for the trust graduation system — action lifecycle,
 * trust phases, and graduation thresholds.
 */

/** The four Glia action types. */
export const ACTION_TYPES = ['prune', 'consolidate', 'link', 'audit'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** Trust phases in graduation order. */
export const TRUST_PHASES = ['propose', 'act_report', 'silent'] as const;
export type TrustPhase = (typeof TRUST_PHASES)[number];

/** Action lifecycle statuses. */
export const ACTION_STATUSES = ['pending', 'approved', 'rejected', 'executed', 'reverted'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/** User decisions on a proposal. */
export const USER_DECISIONS = ['approve', 'reject', 'modify'] as const;
export type UserDecision = (typeof USER_DECISIONS)[number];

/** A Glia action record (row from glia_actions). */
export interface GliaAction {
  id: string;
  actionType: ActionType;
  affectedIds: string[];
  rationale: string;
  payload: unknown | null;
  phase: TrustPhase;
  status: ActionStatus;
  userDecision: UserDecision | null;
  userNote: string | null;
  executedAt: string | null;
  decidedAt: string | null;
  revertedAt: string | null;
  createdAt: string;
}

/** Trust state for a single action type (row from glia_trust_state). */
export interface GliaTrustState {
  actionType: ActionType;
  currentPhase: TrustPhase;
  approvedCount: number;
  rejectedCount: number;
  revertedCount: number;
  autonomousSince: string | null;
  lastRevertAt: string | null;
  graduatedAt: string | null;
  updatedAt: string;
}

/** Input for creating a new action. */
export interface CreateActionInput {
  actionType: ActionType;
  affectedIds: string[];
  rationale: string;
  payload?: unknown;
}

/** Input for deciding on a pending action. */
export interface DecideActionInput {
  id: string;
  decision: UserDecision;
  note?: string;
}

/** Configurable graduation thresholds. */
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

import { getSettingValue } from '../../core/settings/service.js';

/** Hardcoded graduation thresholds per ADR-021. */
const FALLBACK_THRESHOLDS: GraduationThresholds = {
  proposeToActReportMinApproved: 20,
  proposeToActReportMaxRejectionRate: 0.1,
  actReportToSilentMinDays: 60,
  demotionRevertThreshold: 2,
  demotionWindowDays: 7,
};

/** Read graduation thresholds from settings (with hardcoded fallbacks). */
export function getGliaThresholds(): GraduationThresholds {
  return {
    proposeToActReportMinApproved: getSettingValue(
      'cerebrum.glia.proposeMinApproved',
      FALLBACK_THRESHOLDS.proposeToActReportMinApproved
    ),
    proposeToActReportMaxRejectionRate: getSettingValue(
      'cerebrum.glia.proposeMaxRejectionRate',
      FALLBACK_THRESHOLDS.proposeToActReportMaxRejectionRate
    ),
    actReportToSilentMinDays: getSettingValue(
      'cerebrum.glia.actReportMinDays',
      FALLBACK_THRESHOLDS.actReportToSilentMinDays
    ),
    demotionRevertThreshold: getSettingValue(
      'cerebrum.glia.demotionRevertThreshold',
      FALLBACK_THRESHOLDS.demotionRevertThreshold
    ),
    demotionWindowDays: getSettingValue(
      'cerebrum.glia.demotionWindowDays',
      FALLBACK_THRESHOLDS.demotionWindowDays
    ),
  };
}

/**
 * @deprecated Use `getGliaThresholds()` instead. Retained for backward
 * compatibility with tests that depend on a static constant.
 */
export const DEFAULT_THRESHOLDS: GraduationThresholds = FALLBACK_THRESHOLDS;

/** Filters for querying actions. */
export interface ActionListFilters {
  actionType?: ActionType;
  status?: ActionStatus;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}
