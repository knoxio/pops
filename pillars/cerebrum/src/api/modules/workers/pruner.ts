/**
 * Pruner Worker (US-01, PRD-085).
 *
 * Computes staleness scores for engrams and detects orphans. Engrams above
 * the staleness threshold are proposed for archival. Orphans (zero inbound
 * links + zero query hits in the last N days) use a lower threshold.
 */
import {
  buildRationale,
  computeStaleness,
  defaultInboundLinkCount,
  isOrphan,
  type StalenessLookups,
} from './pruner-helpers.js';
import {
  DEFAULT_PRUNER_CONFIG,
  type GliaActionType,
  type PrunePayload,
  type PrunerConfig,
  type StalenessResult,
  type WorkerRunResult,
} from './types.js';
import { WorkerBase, type WorkerBaseDeps } from './worker-base.js';

import type { Engram } from '../engrams/types.js';

export interface PrunerDeps extends WorkerBaseDeps {
  config?: Partial<PrunerConfig>;
  /** Lookup function for inbound link counts — defaults to searching the list. */
  getInboundLinkCount?: (engramId: string, allEngrams: Engram[]) => number;
  /** Lookup function for query hit counts — defaults to 0 (maximum staleness). */
  getQueryHitCount?: (engramId: string) => number;
  /** Lookup function for last queried date — defaults to undefined (max staleness). */
  getLastQueriedAt?: (engramId: string) => Date | undefined;
}

export class PrunerWorker extends WorkerBase {
  protected readonly actionType: GliaActionType = 'prune';
  private readonly config: PrunerConfig;
  private readonly lookups: StalenessLookups;

  constructor(deps: PrunerDeps) {
    super(deps);
    this.config = { ...DEFAULT_PRUNER_CONFIG, ...deps.config };
    this.lookups = {
      getInboundLinkCount: deps.getInboundLinkCount ?? defaultInboundLinkCount,
      getQueryHitCount: deps.getQueryHitCount ?? (() => 0),
      getLastQueriedAt: deps.getLastQueriedAt ?? (() => undefined),
    };
  }

  async run(dryRun = false): Promise<WorkerRunResult> {
    const phase = this.resolvePhase(dryRun);
    const engrams = this.listActiveEngrams();
    const actions = [];
    let skipped = 0;

    for (let i = 0; i < engrams.length; i += this.config.batchSize) {
      const batch = engrams.slice(i, i + this.config.batchSize);
      for (const engram of batch) {
        const result = this.computeStaleness(engram, engrams);
        const orphan = isOrphan(engram, result, {
          now: this.now(),
          orphanDays: this.config.orphanDays,
          getLastQueriedAt: this.lookups.getLastQueriedAt,
        });
        const threshold = orphan ? this.config.orphanThreshold : this.config.stalenessThreshold;

        if (result.score < threshold) {
          skipped++;
          continue;
        }

        const rationale = buildRationale(engram, result, orphan, this.config.orphanDays);
        const payload: PrunePayload = {
          type: 'archive',
          stalenessScore: result.score,
          factors: result.factors,
          isOrphan: orphan,
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
    return computeStaleness(engram, allEngrams, this.now(), this.lookups);
  }
}
