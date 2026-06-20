/**
 * Detector-layer types for the cerebrum nudges write surface (PRD-084).
 *
 * The wire/persistence types (`Nudge`, `NudgeCandidate`, `NudgePriority`,
 * `NudgeType`, `EngramSummary`) live in the db package and are re-exported here
 * for the detectors' convenience. The threshold + detected-pattern shapes are
 * detector-internal and live in this module.
 *
 * Pillar delta: the monolith resolves thresholds from a settings service. The
 * pillar has none, so {@link getDefaultNudgeThresholds} returns the hardcoded
 * PRD-084 fallbacks (with `CEREBRUM_NUDGE_*` env overrides for ops tuning) and
 * the live thresholds are held in-process by the handler factory — mutated by
 * `configure`, read by `scan`. They are NOT persisted across restarts.
 */
import type { NudgeCandidate } from '../../../db/index.js';

export type {
  EngramSummary,
  Nudge,
  NudgeAction,
  NudgeActionType,
  NudgeCandidate,
  NudgePriority,
  NudgeStatus,
  NudgeType,
} from '../../../db/index.js';

/** Configurable thresholds for nudge detection. */
export interface NudgeThresholds {
  /** Minimum embedding similarity to propose consolidation. Default 0.85. */
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

const FALLBACK_THRESHOLDS: NudgeThresholds = {
  consolidationSimilarity: 0.85,
  consolidationMinCluster: 3,
  stalenessDays: 90,
  patternMinOccurrences: 5,
  maxPendingNudges: 20,
  nudgeCooldownHours: 24,
};

function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Resolve the default thresholds — hardcoded PRD-084 values + env overrides. */
export function getDefaultNudgeThresholds(): NudgeThresholds {
  return {
    consolidationSimilarity: envNumber(
      'CEREBRUM_NUDGE_CONSOLIDATION_SIMILARITY',
      FALLBACK_THRESHOLDS.consolidationSimilarity
    ),
    consolidationMinCluster: envNumber(
      'CEREBRUM_NUDGE_CONSOLIDATION_MIN_CLUSTER',
      FALLBACK_THRESHOLDS.consolidationMinCluster
    ),
    stalenessDays: envNumber('CEREBRUM_NUDGE_STALENESS_DAYS', FALLBACK_THRESHOLDS.stalenessDays),
    patternMinOccurrences: envNumber(
      'CEREBRUM_NUDGE_PATTERN_MIN_OCCURRENCES',
      FALLBACK_THRESHOLDS.patternMinOccurrences
    ),
    maxPendingNudges: envNumber('CEREBRUM_NUDGE_MAX_PENDING', FALLBACK_THRESHOLDS.maxPendingNudges),
    nudgeCooldownHours: envNumber(
      'CEREBRUM_NUDGE_COOLDOWN_HOURS',
      FALLBACK_THRESHOLDS.nudgeCooldownHours
    ),
  };
}

/** Result from a detector pass — zero or more nudge candidates. */
export interface DetectorResult {
  nudges: NudgeCandidate[];
}

/**
 * Evidence for a single contradiction between two engrams.
 *
 * Produced by the {@link ContradictionAnalyzer} and embedded into pattern
 * nudges so the user can compare both sides without opening either source.
 * Excerpts are short verbatim quotes (≤ 240 chars) from each side.
 */
export interface ContradictionEvidence {
  engramA: string;
  engramB: string;
  excerptA: string;
  excerptB: string;
  conflict: string;
}

/** A detected pattern from the PatternDetector. */
export interface DetectedPattern {
  patternType: 'recurring' | 'emerging' | 'contradiction';
  topic: string;
  engramIds: string[];
  count: number;
  dateRange: { from: string; to: string };
  trendDirection: 'rising' | 'stable' | 'declining';
  /** Populated only when patternType === 'contradiction'. */
  contradiction?: ContradictionEvidence;
}
