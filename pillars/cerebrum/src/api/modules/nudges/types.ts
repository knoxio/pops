/**
 * Detector-layer types for the cerebrum nudges write surface.
 *
 * The wire/persistence types (`Nudge`, `NudgeCandidate`, `NudgePriority`,
 * `NudgeType`, `EngramSummary`) live in `src/db` and are re-exported here for
 * the detectors' convenience. The threshold + detected-pattern shapes are
 * detector-internal and live in this module.
 *
 * {@link getDefaultNudgeThresholds} returns the hardcoded fallbacks (with
 * `CEREBRUM_NUDGE_*` env overrides for ops tuning); the live thresholds are held
 * in-process by the handler factory — mutated by `configure`, read by `scan`,
 * and NOT persisted across restarts.
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
  /** Minimum embedding similarity to propose consolidation. */
  consolidationSimilarity: number;
  /** Minimum cluster size to trigger a consolidation nudge. */
  consolidationMinCluster: number;
  /** Days since modification before an engram is flagged as stale. */
  stalenessDays: number;
  /** Minimum occurrences of a topic before it is flagged as a pattern. */
  patternMinOccurrences: number;
  /** Maximum pending nudges — oldest are expired when exceeded. */
  maxPendingNudges: number;
  /** Minimum hours between nudges of the same type for the same engrams. */
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

/** Resolve the default thresholds — hardcoded fallbacks + env overrides. */
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
