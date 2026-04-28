/**
 * Types for the proactive nudge system (PRD-084).
 *
 * Covers: Nudge, NudgeType, NudgeStatus, NudgePriority, NudgeAction,
 * NudgeThresholds, and the detector interfaces.
 */

/** Nudge types: the four detection modes. */
export type NudgeType = 'consolidation' | 'staleness' | 'pattern' | 'insight';

/** Nudge statuses track the lifecycle of a nudge. */
export type NudgeStatus = 'pending' | 'dismissed' | 'acted' | 'expired';

/** Nudge priority determines delivery urgency. */
export type NudgePriority = 'low' | 'medium' | 'high';

/** Suggested action types a nudge can propose. */
export type NudgeActionType = 'consolidate' | 'archive' | 'review' | 'link';

/** A suggested action attached to a nudge. */
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

/** Configurable thresholds for nudge detection. */
export interface NudgeThresholds {
  /** Minimum Thalamus similarity to propose consolidation. Default 0.85. */
  consolidationSimilarity: number;
  /** Minimum cluster size to trigger a consolidation nudge. Default 3. */
  consolidationMinCluster: number;
  /** Days since modification before an engram is flagged as stale. Default 90. */
  stalenessDays: number;
  /** Minimum occurrences of a topic before it is flagged as a pattern. Default 5. */
  patternMinOccurrences: number;
  /** Maximum pending nudges — oldest are expired when exceeded. Default 20. */
  maxPendingNudges: number;
  /** Minimum hours between nudges of the same type for the same engrams. Default 24. */
  nudgeCooldownHours: number;
}

import { getSettingValue } from '../../core/settings/service.js';

/** Hardcoded fallback thresholds per PRD-084 specification. */
const FALLBACK_THRESHOLDS: NudgeThresholds = {
  consolidationSimilarity: 0.85,
  consolidationMinCluster: 3,
  stalenessDays: 90,
  patternMinOccurrences: 5,
  maxPendingNudges: 20,
  nudgeCooldownHours: 24,
};

/** Default thresholds from settings (falls back to hardcoded defaults). */
export function getDefaultNudgeThresholds(): NudgeThresholds {
  return {
    consolidationSimilarity: getSettingValue(
      'cerebrum.nudge.consolidationSimilarity',
      FALLBACK_THRESHOLDS.consolidationSimilarity
    ),
    consolidationMinCluster: getSettingValue(
      'cerebrum.nudge.consolidationMinCluster',
      FALLBACK_THRESHOLDS.consolidationMinCluster
    ),
    stalenessDays: getSettingValue(
      'cerebrum.nudge.stalenessDays',
      FALLBACK_THRESHOLDS.stalenessDays
    ),
    patternMinOccurrences: getSettingValue(
      'cerebrum.nudge.patternMinOccurrences',
      FALLBACK_THRESHOLDS.patternMinOccurrences
    ),
    maxPendingNudges: getSettingValue(
      'cerebrum.nudge.maxPending',
      FALLBACK_THRESHOLDS.maxPendingNudges
    ),
    nudgeCooldownHours: getSettingValue(
      'cerebrum.nudge.cooldownHours',
      FALLBACK_THRESHOLDS.nudgeCooldownHours
    ),
  };
}

/**
 * @deprecated Use `getDefaultNudgeThresholds()` instead. Retained for backward
 * compatibility with tests that depend on a static constant.
 */
export const DEFAULT_THRESHOLDS: NudgeThresholds = FALLBACK_THRESHOLDS;

/** Result from a detector scan — zero or more nudge candidates. */
export interface DetectorResult {
  nudges: NudgeCandidate[];
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

/** Engram summary used by detectors (subset of the full Engram type). */
export interface EngramSummary {
  id: string;
  type: string;
  title: string;
  scopes: string[];
  tags: string[];
  status: string;
  createdAt: string;
  modifiedAt: string;
}

/** A detected pattern from the PatternDetector. */
export interface DetectedPattern {
  patternType: 'recurring' | 'emerging' | 'contradiction';
  topic: string;
  engramIds: string[];
  count: number;
  dateRange: { from: string; to: string };
  trendDirection: 'rising' | 'stable' | 'declining';
}
