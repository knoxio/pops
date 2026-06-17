/**
 * Pruner worker helpers — staleness scoring, orphan detection, and rationale building.
 * Extracted from pruner.ts to respect max-lines-per-file.
 */
import type { Engram } from '../engrams/types.js';
import type { StalenessFactors, StalenessResult } from './types.js';

/** Weights for the staleness score computation. */
const STALENESS_WEIGHTS = {
  daysSinceModified: 0.3,
  daysSinceReferenced: 0.3,
  inboundLinkCount: 0.2,
  queryHitCount: 0.2,
} as const;

/** Maximum days for capping the linear decay. */
export const MAX_STALENESS_DAYS = 365;

/** Maximum link/hit counts for normalization (inverse). */
const MAX_LINK_COUNT = 20;
const MAX_HIT_COUNT = 50;

/** Days window for "recent" query activity check. */
const RECENT_QUERY_WINDOW_DAYS = 7;

/** Compute days between two dates (floored to whole days). */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

/** Normalise a days value to 0-1 range, capped at maxDays. */
export function normaliseDays(days: number, maxDays: number): number {
  return Math.min(days / maxDays, 1.0);
}

/** Normalise a count inversely — higher count = lower staleness. */
export function normaliseCountInverse(count: number, maxCount: number): number {
  return 1.0 - Math.min(count / maxCount, 1.0);
}

/** Default inbound link counter — counts how many other engrams link to this one. */
export function defaultInboundLinkCount(engramId: string, allEngrams: Engram[]): number {
  return allEngrams.filter((e) => e.links.includes(engramId)).length;
}

/** Lookup functions injected by the pruner worker. */
export interface StalenessLookups {
  getInboundLinkCount: (engramId: string, allEngrams: Engram[]) => number;
  getQueryHitCount: (engramId: string) => number;
  getLastQueriedAt: (engramId: string) => Date | undefined;
}

/** Compute the staleness score for a single engram. */
export function computeStaleness(
  engram: Engram,
  allEngrams: Engram[],
  now: Date,
  lookups: StalenessLookups
): StalenessResult {
  const modifiedDate = new Date(engram.modified);
  const daysSinceModified = daysBetween(modifiedDate, now);

  const lastQueried = lookups.getLastQueriedAt(engram.id);
  const daysSinceReferenced = lastQueried ? daysBetween(lastQueried, now) : MAX_STALENESS_DAYS;

  const inboundLinkCount = lookups.getInboundLinkCount(engram.id, allEngrams);
  const queryHitCount = lookups.getQueryHitCount(engram.id);

  const recentQueryBoost = lastQueried && daysBetween(lastQueried, now) <= RECENT_QUERY_WINDOW_DAYS;

  const factors: StalenessFactors = {
    daysSinceModified,
    daysSinceReferenced,
    inboundLinkCount,
    queryHitCount,
  };

  const normModified = normaliseDays(daysSinceModified, MAX_STALENESS_DAYS);
  const normReferenced = normaliseDays(daysSinceReferenced, MAX_STALENESS_DAYS);
  const normLinks = normaliseCountInverse(inboundLinkCount, MAX_LINK_COUNT);
  const normHits = recentQueryBoost ? 0.0 : normaliseCountInverse(queryHitCount, MAX_HIT_COUNT);

  const score =
    STALENESS_WEIGHTS.daysSinceModified * normModified +
    STALENESS_WEIGHTS.daysSinceReferenced * normReferenced +
    STALENESS_WEIGHTS.inboundLinkCount * normLinks +
    STALENESS_WEIGHTS.queryHitCount * normHits;

  return { score: Math.min(1.0, Math.max(0.0, score)), factors };
}

/** Options for orphan detection. */
export interface OrphanCheckOptions {
  now: Date;
  orphanDays: number;
  getLastQueriedAt: (engramId: string) => Date | undefined;
}

/** Determine if an engram qualifies as an orphan. */
export function isOrphan(
  engram: Engram,
  result: StalenessResult,
  options: OrphanCheckOptions
): boolean {
  const lastQueried = options.getLastQueriedAt(engram.id);
  const queryInWindow = lastQueried
    ? daysBetween(lastQueried, options.now) <= options.orphanDays
    : false;
  return result.factors.inboundLinkCount === 0 && !queryInWindow;
}

/** Identify the factor contributing most to staleness. */
export function getDominantFactor(result: StalenessResult): string {
  const normModified = normaliseDays(result.factors.daysSinceModified, MAX_STALENESS_DAYS);
  const normReferenced = normaliseDays(result.factors.daysSinceReferenced, MAX_STALENESS_DAYS);
  const normLinks = normaliseCountInverse(result.factors.inboundLinkCount, MAX_LINK_COUNT);
  const normHits = normaliseCountInverse(result.factors.queryHitCount, MAX_HIT_COUNT);

  const contributions = [
    { name: 'days since modified', value: STALENESS_WEIGHTS.daysSinceModified * normModified },
    {
      name: 'days since referenced',
      value: STALENESS_WEIGHTS.daysSinceReferenced * normReferenced,
    },
    { name: 'low inbound links', value: STALENESS_WEIGHTS.inboundLinkCount * normLinks },
    { name: 'low query hits', value: STALENESS_WEIGHTS.queryHitCount * normHits },
  ];

  contributions.sort((a, b) => b.value - a.value);
  return contributions[0]?.name ?? 'unknown';
}

/** Build a human-readable rationale explaining why the engram is stale. */
export function buildRationale(
  engram: Engram,
  result: StalenessResult,
  orphan: boolean,
  orphanDays: number
): string {
  const parts: string[] = [];

  if (orphan) {
    parts.push(
      `Orphan engram: zero inbound links and no query hits in the last ${orphanDays} days.`
    );
  }

  parts.push(`Staleness score: ${result.score.toFixed(2)}.`);

  const dominantFactor = getDominantFactor(result);
  parts.push(`Dominant factor: ${dominantFactor}.`);

  parts.push(`Last modified: ${engram.modified}.`);

  if (result.factors.inboundLinkCount === 0) {
    parts.push('No inbound links from other engrams.');
  }

  return parts.join(' ');
}
