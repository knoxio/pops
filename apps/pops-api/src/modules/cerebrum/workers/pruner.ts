import {
  DEFAULT_PRUNER_CONFIG,
  type GliaActionType,
  type PrunePayload,
  type PrunerConfig,
  type StalenessFactors,
  type StalenessResult,
  type WorkerRunResult,
} from './types.js';
/**
 * Pruner Worker (US-01, PRD-085).
 *
 * Computes staleness scores for engrams and detects orphans. Engrams above
 * the staleness threshold are proposed for archival. Orphans (zero inbound
 * links + zero query hits in the last N days) use a lower threshold.
 *
 * Staleness factors:
 *   - Days since modified (weight 0.3, linear decay capped at 365 days)
 *   - Days since referenced (weight 0.3, last query/link activity)
 *   - Inbound link count (weight 0.2, inverse — more links = less stale)
 *   - Query hit count (weight 0.2, inverse — more hits = less stale)
 */
import { WorkerBase, type WorkerBaseDeps } from './worker-base.js';

import type { Engram } from '../engrams/types.js';

/** Weights for the staleness score computation. */
const STALENESS_WEIGHTS = {
  daysSinceModified: 0.3,
  daysSinceReferenced: 0.3,
  inboundLinkCount: 0.2,
  queryHitCount: 0.2,
} as const;

/** Maximum days for capping the linear decay. */
const MAX_STALENESS_DAYS = 365;

/** Maximum link/hit counts for normalization (inverse). */
const MAX_LINK_COUNT = 20;
const MAX_HIT_COUNT = 50;

/** Days window for "recent" query activity check. */
const RECENT_QUERY_WINDOW_DAYS = 7;

export interface PrunerDeps extends WorkerBaseDeps {
  config?: Partial<PrunerConfig>;
  /** Lookup function for inbound link counts — defaults to searching the list. */
  getInboundLinkCount?: (engramId: string, allEngrams: Engram[]) => number;
  /** Lookup function for query hit counts — defaults to 0 (maximum staleness). */
  getQueryHitCount?: (engramId: string) => number;
  /** Lookup function for last queried date — defaults to undefined (max staleness). */
  getLastQueriedAt?: (engramId: string) => Date | undefined;
}

/** Compute days between two dates (floored to whole days). */
function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

/** Normalise a days value to 0–1 range, capped at maxDays. */
function normaliseDays(days: number, maxDays: number): number {
  return Math.min(days / maxDays, 1.0);
}

/** Normalise a count inversely — higher count = lower staleness. */
function normaliseCountInverse(count: number, maxCount: number): number {
  return 1.0 - Math.min(count / maxCount, 1.0);
}

export class PrunerWorker extends WorkerBase {
  protected readonly actionType: GliaActionType = 'prune';
  private readonly config: PrunerConfig;
  private readonly getInboundLinkCount: (engramId: string, allEngrams: Engram[]) => number;
  private readonly getQueryHitCount: (engramId: string) => number;
  private readonly getLastQueriedAt: (engramId: string) => Date | undefined;

  constructor(deps: PrunerDeps) {
    super(deps);
    this.config = { ...DEFAULT_PRUNER_CONFIG, ...deps.config };
    this.getInboundLinkCount = deps.getInboundLinkCount ?? defaultInboundLinkCount;
    this.getQueryHitCount = deps.getQueryHitCount ?? (() => 0);
    this.getLastQueriedAt = deps.getLastQueriedAt ?? (() => undefined);
  }

  async run(dryRun = false): Promise<WorkerRunResult> {
    const phase = this.resolvePhase(dryRun);
    const engrams = this.listActiveEngrams();
    const actions = [];
    let skipped = 0;

    // Process in batches
    for (let i = 0; i < engrams.length; i += this.config.batchSize) {
      const batch = engrams.slice(i, i + this.config.batchSize);
      for (const engram of batch) {
        const result = this.computeStaleness(engram, engrams);

        const isOrphan = this.isOrphan(engram, result);
        const threshold = isOrphan ? this.config.orphanThreshold : this.config.stalenessThreshold;

        if (result.score < threshold) {
          skipped++;
          continue;
        }

        const rationale = this.buildRationale(engram, result, isOrphan);
        const payload: PrunePayload = {
          type: 'archive',
          stalenessScore: result.score,
          factors: result.factors,
          isOrphan,
        };

        const action = this.createAction([engram.id], rationale, payload, phase);

        if (phase !== 'propose') {
          this.engramService.archive(engram.id);
          action.status = 'executed';
        }

        actions.push(action);
      }
    }

    return { actions, processed: engrams.length, skipped };
  }

  /**
   * Compute the staleness score for a single engram.
   * Exposed as a public method for the `getStalenessScore` API endpoint.
   */
  computeStaleness(engram: Engram, allEngrams: Engram[]): StalenessResult {
    const now = this.now();
    const modifiedDate = new Date(engram.modified);
    const daysSinceModified = daysBetween(modifiedDate, now);

    const lastQueried = this.getLastQueriedAt(engram.id);
    const daysSinceReferenced = lastQueried ? daysBetween(lastQueried, now) : MAX_STALENESS_DAYS;

    const inboundLinkCount = this.getInboundLinkCount(engram.id, allEngrams);
    const queryHitCount = this.getQueryHitCount(engram.id);

    // Reset query hit staleness if queried within the recent window.
    const recentQueryBoost =
      lastQueried && daysBetween(lastQueried, now) <= RECENT_QUERY_WINDOW_DAYS;

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

  /** Determine if an engram qualifies as an orphan. */
  private isOrphan(engram: Engram, result: StalenessResult): boolean {
    const now = this.now();
    const lastQueried = this.getLastQueriedAt(engram.id);
    const queryInWindow = lastQueried
      ? daysBetween(lastQueried, now) <= this.config.orphanDays
      : false;
    return result.factors.inboundLinkCount === 0 && !queryInWindow;
  }

  /** Build a human-readable rationale explaining why the engram is stale. */
  private buildRationale(engram: Engram, result: StalenessResult, isOrphan: boolean): string {
    const parts: string[] = [];

    if (isOrphan) {
      parts.push(
        `Orphan engram: zero inbound links and no query hits in the last ${this.config.orphanDays} days.`
      );
    }

    parts.push(`Staleness score: ${result.score.toFixed(2)}.`);

    const dominantFactor = this.getDominantFactor(result);
    parts.push(`Dominant factor: ${dominantFactor}.`);

    parts.push(`Last modified: ${engram.modified}.`);

    if (result.factors.inboundLinkCount === 0) {
      parts.push('No inbound links from other engrams.');
    }

    return parts.join(' ');
  }

  /** Identify the factor contributing most to staleness. */
  private getDominantFactor(result: StalenessResult): string {
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
}

/** Default inbound link counter — counts how many other engrams link to this one. */
function defaultInboundLinkCount(engramId: string, allEngrams: Engram[]): number {
  return allEngrams.filter((e) => e.links.includes(engramId)).length;
}
