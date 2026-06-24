/**
 * Helper functions for the PatternDetector. Tag-frequency and time-series
 * passes plus the pattern → nudge projection.
 */
import type { DetectedPattern, EngramSummary, NudgeCandidate } from '../types.js';

/** Tag frequency entry: how many engrams mention a tag within a time window. */
export interface TagFrequency {
  tag: string;
  count: number;
  engramIds: string[];
  earliestDate: string;
  latestDate: string;
}

/** Time-bucketed tag counts for trend detection. */
export interface TagTimeSeries {
  tag: string;
  buckets: { period: string; count: number }[];
  total: number;
  engramIds: string[];
}

const MIN_TREND_BUCKETS = 2;

function accumulateTag(
  freq: Map<string, { count: number; engramIds: string[]; earliest: string; latest: string }>,
  tag: string,
  engramId: string,
  createdAt: string
): void {
  const entry = freq.get(tag);
  if (entry) {
    entry.count++;
    entry.engramIds.push(engramId);
    if (createdAt < entry.earliest) entry.earliest = createdAt;
    if (createdAt > entry.latest) entry.latest = createdAt;
  } else {
    freq.set(tag, { count: 1, engramIds: [engramId], earliest: createdAt, latest: createdAt });
  }
}

/** Count tag frequency within the window. */
export function countTagFrequency(engrams: EngramSummary[], windowStart: string): TagFrequency[] {
  const freq = new Map<
    string,
    { count: number; engramIds: string[]; earliest: string; latest: string }
  >();

  for (const engram of engrams) {
    if (engram.createdAt < windowStart) continue;
    for (const tag of engram.tags) {
      accumulateTag(freq, tag, engram.id, engram.createdAt);
    }
  }

  return [...freq.entries()]
    .map(([tag, entry]) => ({
      tag,
      count: entry.count,
      engramIds: entry.engramIds,
      earliestDate: entry.earliest,
      latestDate: entry.latest,
    }))
    .toSorted((a, b) => b.count - a.count);
}

function accumulateBucket(
  tagBuckets: Map<string, { count: number; engramIds: string[] }>,
  month: string,
  engramId: string
): void {
  const bucket = tagBuckets.get(month);
  if (bucket) {
    bucket.count++;
    bucket.engramIds.push(engramId);
  } else {
    tagBuckets.set(month, { count: 1, engramIds: [engramId] });
  }
}

/** Bucket engrams by month for trend analysis. */
export function buildTimeSeries(engrams: EngramSummary[]): TagTimeSeries[] {
  const series = new Map<string, Map<string, { count: number; engramIds: string[] }>>();

  for (const engram of engrams) {
    const month = engram.createdAt.slice(0, 7);
    for (const tag of engram.tags) {
      let tagBuckets = series.get(tag);
      if (!tagBuckets) {
        tagBuckets = new Map();
        series.set(tag, tagBuckets);
      }
      accumulateBucket(tagBuckets, month, engram.id);
    }
  }

  return [...series.entries()].map(([tag, buckets]) => {
    const sortedBuckets = [...buckets.entries()]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([period, data]) => ({ period, count: data.count }));
    const allIds = [...buckets.values()].flatMap((b) => b.engramIds);
    return {
      tag,
      buckets: sortedBuckets,
      total: sortedBuckets.reduce((sum, b) => sum + b.count, 0),
      engramIds: [...new Set(allIds)],
    };
  });
}

/** Detect if a tag's frequency is accelerating (rising trend). */
export function detectTrend(series: TagTimeSeries): 'rising' | 'stable' | 'declining' {
  const { buckets } = series;
  if (buckets.length < MIN_TREND_BUCKETS) return 'stable';

  const mid = Math.floor(buckets.length / 2);
  const firstHalf = buckets.slice(0, mid).reduce((s, b) => s + b.count, 0);
  const secondHalf = buckets.slice(mid).reduce((s, b) => s + b.count, 0);

  if (secondHalf > firstHalf * 1.5) return 'rising';
  if (firstHalf > secondHalf * 1.5) return 'declining';
  return 'stable';
}

function patternTypeLabel(patternType: DetectedPattern['patternType']): string {
  const labels: Record<DetectedPattern['patternType'], string> = {
    recurring: 'Recurring topic',
    emerging: 'Emerging theme',
    contradiction: 'Contradiction detected',
  };
  return labels[patternType];
}

function patternTypeDescription(pattern: DetectedPattern): string {
  const descriptions: Record<DetectedPattern['patternType'], string> = {
    recurring: `The topic "${pattern.topic}" appears in ${pattern.count} engrams within the recent window.`,
    emerging: `The topic "${pattern.topic}" is accelerating — mentioned in ${pattern.count} engrams with a rising trend.`,
    contradiction: `Engrams express contradictory positions on "${pattern.topic}".`,
  };
  return descriptions[pattern.patternType];
}

function contradictionBody(pattern: DetectedPattern): string {
  const ev = pattern.contradiction;
  if (!ev) {
    return (
      `Engrams express contradictory positions on "${pattern.topic}".\n\n` +
      `Open the source engrams to compare.`
    );
  }
  return (
    `Contradiction on "${pattern.topic}": ${ev.conflict}\n\n` +
    `From ${ev.engramA}:\n"${ev.excerptA}"\n\n` +
    `From ${ev.engramB}:\n"${ev.excerptB}"\n\n` +
    `Review the two engrams to reconcile.`
  );
}

function nonContradictionBody(pattern: DetectedPattern): string {
  return (
    `${patternTypeDescription(pattern)}\n\n` +
    `- Date range: ${pattern.dateRange.from.slice(0, 10)} to ${pattern.dateRange.to.slice(0, 10)}\n` +
    `- Trend: ${pattern.trendDirection}\n` +
    `- Engrams: ${pattern.engramIds.length}\n\n` +
    `Consider creating a research summary or linking related engrams.`
  );
}

/** Convert a detected pattern into a nudge candidate. */
export function patternToNudge(pattern: DetectedPattern): NudgeCandidate {
  const isContradiction = pattern.patternType === 'contradiction';
  const typeLabel = patternTypeLabel(pattern.patternType);
  const trend = pattern.trendDirection === 'rising' ? ' (rising)' : '';
  const rawTitle = `${typeLabel}: "${pattern.topic}" (${pattern.count} engrams${trend})`;
  const title = rawTitle.length > 100 ? rawTitle.slice(0, 97) + '...' : rawTitle;

  const body = isContradiction ? contradictionBody(pattern) : nonContradictionBody(pattern);

  const actionLabel = isContradiction
    ? `Review contradiction on "${pattern.topic}"`
    : `Review ${pattern.count} engrams about "${pattern.topic}"`;

  const actionParams: Record<string, unknown> = {
    engramIds: pattern.engramIds,
    topic: pattern.topic,
  };
  if (isContradiction && pattern.contradiction) {
    actionParams['contradiction'] = pattern.contradiction;
  }

  return {
    type: 'pattern',
    title,
    body,
    engramIds: pattern.engramIds,
    priority: isContradiction ? 'high' : 'medium',
    expiresAt: null,
    action: { type: 'link', label: actionLabel, params: actionParams },
  };
}
