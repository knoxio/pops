/**
 * PatternDetector (PRD-084 US-03).
 *
 * Detects recurring topics, emerging themes, and contradictions across
 * engrams. Tag-frequency and time-series passes are pure synchronous
 * computations. The contradiction pass uses an injected
 * `ContradictionAnalyzer` to compare engram pairs that share tags within a
 * single top-level scope — pairs are routed through an LLM that returns
 * structured conflict evidence (summary + verbatim excerpt from each side).
 *
 * Contradiction detection is optional: when no analyzer is supplied (or
 * when no body reader is wired in) the contradiction pass is a no-op and
 * the detector behaves exactly as it did before #2580.
 */
import { logger } from '../../../../lib/logger.js';
import { NoopContradictionAnalyzer } from './contradiction-analyzer.js';
import { buildContradictionPairs } from './contradiction-pairs.js';
import {
  buildTimeSeries,
  countTagFrequency,
  detectTrend,
  patternToNudge,
} from './pattern-helpers.js';

import type {
  ContradictionEvidence,
  DetectedPattern,
  DetectorResult,
  EngramSummary,
  NudgeThresholds,
} from '../types.js';
import type { ContradictionAnalyzer } from './contradiction-analyzer.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Default rolling window for recurring topic detection (days). */
const DEFAULT_WINDOW_DAYS = 30;

/**
 * Reads the body text for an engram. Returns null when the engram is not
 * readable (deleted, secret, IO error). Adapters wrap `EngramService.read`
 * — keeping the surface narrow lets the detector run with synthetic
 * fixtures in tests.
 */
export type BodyReader = (engramId: string) => string | null;

/**
 * Maximum number of pairs sent to the LLM per scan.
 *
 * Pair-wise comparison is O(n^2) over engrams that share at least one tag;
 * capping protects token spend and end-to-end scan latency. Pairs are
 * ranked by tag overlap so we still examine the most-overlapping candidates
 * first.
 */
const DEFAULT_MAX_PAIRS = 20;

export interface PatternDetectorDeps {
  thresholds: NudgeThresholds;
  /** Returns the current time; injectable for deterministic tests. */
  now?: () => Date;
  /** Optional async analyzer used for the contradiction pass. */
  contradictionAnalyzer?: ContradictionAnalyzer;
  /** Required for contradiction detection; ignored when no analyzer set. */
  bodyReader?: BodyReader;
  /** Cap on LLM pair comparisons per scan. */
  maxContradictionPairs?: number;
}

export class PatternDetector {
  private readonly thresholds: NudgeThresholds;
  private readonly now: () => Date;
  private readonly contradictionAnalyzer: ContradictionAnalyzer;
  private readonly bodyReader: BodyReader | undefined;
  private readonly maxPairs: number;

  constructor(
    thresholdsOrDeps: NudgeThresholds | PatternDetectorDeps,
    now?: () => Date,
    analyzer?: ContradictionAnalyzer,
    bodyReader?: BodyReader
  ) {
    // Support both the legacy positional form (thresholds, now) and the new
    // deps-object form. Pre-#2580 call sites continue to compile.
    const deps: PatternDetectorDeps = isDeps(thresholdsOrDeps)
      ? thresholdsOrDeps
      : {
          thresholds: thresholdsOrDeps,
          now,
          contradictionAnalyzer: analyzer,
          bodyReader,
        };

    this.thresholds = deps.thresholds;
    this.now = deps.now ?? (() => new Date());
    this.contradictionAnalyzer = deps.contradictionAnalyzer ?? new NoopContradictionAnalyzer();
    this.bodyReader = deps.bodyReader;
    this.maxPairs = deps.maxContradictionPairs ?? DEFAULT_MAX_PAIRS;
  }

  /**
   * Detect recurring topics, emerging themes, and contradictions.
   *
   * Returns nudge candidates ready for persistence. The contradiction pass
   * is awaited so the call must be awaited at the call site.
   */
  async detect(engrams: EngramSummary[]): Promise<DetectorResult> {
    const active = engrams.filter((e) => e.status !== 'archived' && e.status !== 'consolidated');

    if (active.length === 0) {
      return { nudges: [] };
    }

    const windowStart = new Date(
      this.now().getTime() - DEFAULT_WINDOW_DAYS * MS_PER_DAY
    ).toISOString();

    const patterns: DetectedPattern[] = [];
    this.detectRecurring(active, windowStart, patterns);
    this.detectEmerging(active, windowStart, patterns);
    await this.detectContradictions(active, patterns);

    return { nudges: patterns.map(patternToNudge) };
  }

  /** Find tags that appear in >= threshold engrams within the window. */
  private detectRecurring(
    engrams: EngramSummary[],
    windowStart: string,
    patterns: DetectedPattern[]
  ): void {
    const tagFreqs = countTagFrequency(engrams, windowStart);

    for (const freq of tagFreqs) {
      if (freq.count < this.thresholds.patternMinOccurrences) break; // sorted desc
      patterns.push({
        patternType: 'recurring',
        topic: freq.tag,
        engramIds: freq.engramIds,
        count: freq.count,
        dateRange: { from: freq.earliestDate, to: freq.latestDate },
        trendDirection: 'stable',
      });
    }
  }

  /** Find tags whose frequency is accelerating over time. */
  private detectEmerging(
    engrams: EngramSummary[],
    windowStart: string,
    patterns: DetectedPattern[]
  ): void {
    const timeSeries = buildTimeSeries(engrams);

    for (const series of timeSeries) {
      if (series.total < this.thresholds.patternMinOccurrences) continue;
      const trend = detectTrend(series);
      if (trend !== 'rising') continue;

      const existing = patterns.find(
        (p) => p.topic === series.tag && p.patternType === 'recurring'
      );
      if (existing) {
        existing.trendDirection = 'rising';
        continue;
      }

      const allDates = series.engramIds
        .map((id) => engrams.find((e) => e.id === id)?.createdAt)
        .filter((d): d is string => d !== undefined)
        .toSorted();

      patterns.push({
        patternType: 'emerging',
        topic: series.tag,
        engramIds: series.engramIds,
        count: series.total,
        dateRange: {
          from: allDates[0] ?? windowStart,
          to: allDates.at(-1) ?? this.now().toISOString(),
        },
        trendDirection: 'rising',
      });
    }
  }

  /**
   * Compare engram pairs that share tags within a single top-level scope.
   * Each pair is sent to the analyzer; positive results become contradiction
   * patterns carrying the conflict summary plus per-side excerpts.
   */
  private async detectContradictions(
    engrams: EngramSummary[],
    patterns: DetectedPattern[]
  ): Promise<void> {
    if (!this.bodyReader) return;
    const reader = this.bodyReader;

    const pairs = buildContradictionPairs(engrams).slice(0, this.maxPairs);
    if (pairs.length === 0) return;

    for (const pair of pairs) {
      const bodyA = reader(pair.a.id);
      const bodyB = reader(pair.b.id);
      if (bodyA === null || bodyB === null) continue;

      let evidence: ContradictionEvidence | null = null;
      try {
        evidence = await this.contradictionAnalyzer.analyze(pair.a.id, bodyA, pair.b.id, bodyB);
      } catch (err) {
        // Single-pair failures must not abort the rest of the scan, but
        // we still emit telemetry so silent regressions are catchable.
        logger.warn(
          { err, engramA: pair.a.id, engramB: pair.b.id },
          '[patterns] contradiction analyzer failed for pair'
        );
        continue;
      }
      if (!evidence) continue;

      patterns.push({
        patternType: 'contradiction',
        topic: pair.sharedTag,
        engramIds: [pair.a.id, pair.b.id],
        count: 2,
        dateRange: {
          from: minIso(pair.a.createdAt, pair.b.createdAt),
          to: maxIso(pair.a.modifiedAt, pair.b.modifiedAt),
        },
        trendDirection: 'stable',
        contradiction: evidence,
      });
    }
  }
}

function isDeps(value: NudgeThresholds | PatternDetectorDeps): value is PatternDetectorDeps {
  return 'thresholds' in value;
}

function minIso(a: string, b: string): string {
  return a < b ? a : b;
}

function maxIso(a: string, b: string): string {
  return a > b ? a : b;
}
