/**
 * PatternDetector (see docs/prds/proactive-nudges).
 *
 * Detects recurring topics, emerging themes, and contradictions across
 * engrams. The tag-frequency and time-series passes are pure synchronous
 * computations. The contradiction pass routes engram pairs sharing tags within
 * one top-level scope through an injected {@link ContradictionAnalyzer} (the
 * LLM port) that returns structured conflict evidence.
 *
 * Contradiction detection is optional: with no body reader wired in, the pass
 * is a no-op and the detector behaves as a pure tag/trend analyzer.
 */
import { NoopContradictionAnalyzer } from '../contradiction-analyzer.js';
import { buildContradictionPairs } from './contradiction-pairs.js';
import {
  buildTimeSeries,
  countTagFrequency,
  detectTrend,
  patternToNudge,
} from './pattern-helpers.js';

import type { ContradictionAnalyzer } from '../contradiction-analyzer.js';
import type {
  ContradictionEvidence,
  DetectedPattern,
  DetectorResult,
  EngramSummary,
  NudgeThresholds,
} from '../types.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_MAX_PAIRS = 20;

/**
 * Reads the body text for an engram. Returns `null` when the engram is not
 * readable (deleted, secret, IO error). Adapters wrap `EngramService.read` so
 * the detector can run with synthetic fixtures in tests.
 */
export type BodyReader = (engramId: string) => string | null;

export interface PatternDetectorDeps {
  thresholds: NudgeThresholds;
  now?: () => Date;
  contradictionAnalyzer?: ContradictionAnalyzer;
  /** Required for contradiction detection; ignored when no analyzer is set. */
  bodyReader?: BodyReader;
  maxContradictionPairs?: number;
}

function minIso(a: string, b: string): string {
  return a < b ? a : b;
}

function maxIso(a: string, b: string): string {
  return a > b ? a : b;
}

export class PatternDetector {
  private readonly thresholds: NudgeThresholds;
  private readonly now: () => Date;
  private readonly contradictionAnalyzer: ContradictionAnalyzer;
  private readonly bodyReader: BodyReader | undefined;
  private readonly maxPairs: number;

  constructor(deps: PatternDetectorDeps) {
    this.thresholds = deps.thresholds;
    this.now = deps.now ?? (() => new Date());
    this.contradictionAnalyzer = deps.contradictionAnalyzer ?? new NoopContradictionAnalyzer();
    this.bodyReader = deps.bodyReader;
    this.maxPairs = deps.maxContradictionPairs ?? DEFAULT_MAX_PAIRS;
  }

  async detect(engrams: EngramSummary[]): Promise<DetectorResult> {
    const active = engrams.filter((e) => e.status !== 'archived' && e.status !== 'consolidated');
    if (active.length === 0) return { nudges: [] };

    const windowStart = new Date(
      this.now().getTime() - DEFAULT_WINDOW_DAYS * MS_PER_DAY
    ).toISOString();

    const patterns: DetectedPattern[] = [];
    this.detectRecurring(active, patterns, windowStart);
    this.detectEmerging(active, patterns, windowStart);
    await this.detectContradictions(active, patterns);

    return { nudges: patterns.map(patternToNudge) };
  }

  private detectRecurring(
    engrams: EngramSummary[],
    patterns: DetectedPattern[],
    windowStart: string
  ): void {
    for (const freq of countTagFrequency(engrams, windowStart)) {
      if (freq.count < this.thresholds.patternMinOccurrences) break;
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

  private detectEmerging(
    engrams: EngramSummary[],
    patterns: DetectedPattern[],
    windowStart: string
  ): void {
    for (const series of buildTimeSeries(engrams)) {
      if (series.total < this.thresholds.patternMinOccurrences) continue;
      if (detectTrend(series) !== 'rising') continue;

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

  private async detectContradictions(
    engrams: EngramSummary[],
    patterns: DetectedPattern[]
  ): Promise<void> {
    const reader = this.bodyReader;
    if (!reader) return;

    const pairs = buildContradictionPairs(engrams).slice(0, this.maxPairs);
    for (const pair of pairs) {
      const bodyA = reader(pair.a.id);
      const bodyB = reader(pair.b.id);
      if (bodyA === null || bodyB === null) continue;

      let evidence: ContradictionEvidence | null = null;
      try {
        evidence = await this.contradictionAnalyzer.analyze(pair.a.id, bodyA, pair.b.id, bodyB);
      } catch (err) {
        console.warn(
          `[cerebrum-nudges] contradiction analyzer failed for ${pair.a.id}/${pair.b.id}: ${
            err instanceof Error ? err.message : String(err)
          }`
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
