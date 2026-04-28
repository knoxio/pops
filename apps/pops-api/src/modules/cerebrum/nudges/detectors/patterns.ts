/**
 * PatternDetector (PRD-084 US-03).
 *
 * Detects recurring topics and emerging themes across engrams using
 * tag-based frequency analysis and time-series trend detection.
 */
import {
  buildTimeSeries,
  countTagFrequency,
  detectTrend,
  patternToNudge,
} from './pattern-helpers.js';

import type { DetectedPattern, DetectorResult, EngramSummary, NudgeThresholds } from '../types.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Default rolling window for recurring topic detection (days). */
const DEFAULT_WINDOW_DAYS = 30;

export class PatternDetector {
  private readonly thresholds: NudgeThresholds;
  private readonly now: () => Date;

  constructor(thresholds: NudgeThresholds, now?: () => Date) {
    this.thresholds = thresholds;
    this.now = now ?? (() => new Date());
  }

  /** Detect recurring topics and emerging themes from engram tags. */
  detect(engrams: EngramSummary[]): DetectorResult {
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
}
