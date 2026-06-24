/**
 * Nudge write surface for the cerebrum pillar: `scan`, `act`, `configure`.
 *
 * `scan` runs the consolidation / staleness / pattern detectors over the active
 * engram corpus and persists new candidates to `nudge_log` (cooldown dedup +
 * pending-cap enforcement live in `src/db`). `act` executes a pending nudge's
 * suggested action through the in-pillar {@link EngramService} (consolidate /
 * archive / review / link) then marks it `acted`. `configure` mutates the
 * in-process detection thresholds.
 *
 * Threshold persistence: thresholds are held in-process (the
 * {@link ThresholdsStore} this service mutates) so `configure` round-trips with
 * `scan` within the same process; they are NOT persisted across restarts and
 * reset to {@link getDefaultNudgeThresholds} on boot.
 */
import { and, eq } from 'drizzle-orm';

import {
  type CerebrumDb,
  engramsService,
  type Nudge,
  nudgeLog,
  nudgeLogService,
  rowToNudge,
} from '../../../db/index.js';
import { ConcatenationSynthesizer, executeConsolidationAct } from './consolidation-act.js';
import { ConsolidationDetector } from './detectors/consolidation.js';
import { PatternDetector } from './detectors/patterns.js';
import { StalenessDetector } from './detectors/staleness.js';

import type { EngramService } from '../engrams/service.js';
import type { HybridSearchService } from '../retrieval/hybrid-search.js';
import type { BodySynthesizer } from './consolidation-act.js';
import type { ContradictionAnalyzer } from './contradiction-analyzer.js';
import type { NudgeCandidate, NudgeThresholds, NudgeType } from './types.js';

/** Mutable holder for the in-process detection thresholds. */
export interface ThresholdsStore {
  current: NudgeThresholds;
}

export interface NudgeWriteServiceDeps {
  db: CerebrumDb;
  searchService: HybridSearchService;
  engramService: EngramService;
  contradictionAnalyzer: ContradictionAnalyzer;
  thresholdsStore: ThresholdsStore;
  now?: () => Date;
  synthesizer?: BodySynthesizer;
}

export interface NudgeWriteService {
  scan(type?: NudgeType): Promise<{ created: number }>;
  act(id: string): Promise<{ success: boolean; nudge: Nudge | null }>;
  configure(patch: Partial<NudgeThresholds>): { success: boolean };
}

class NudgeWriteServiceImpl implements NudgeWriteService {
  private readonly now: () => Date;
  private readonly synthesizer: BodySynthesizer;

  constructor(private readonly deps: NudgeWriteServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.synthesizer = deps.synthesizer ?? new ConcatenationSynthesizer();
  }

  private get(id: string): Nudge | null {
    const [row] = this.deps.db.select().from(nudgeLog).where(eq(nudgeLog.id, id)).all();
    return row ? rowToNudge(row) : null;
  }

  private persist(candidates: NudgeCandidate[]): number {
    return nudgeLogService.persistCandidates(
      this.deps.db,
      candidates,
      this.deps.thresholdsStore.current,
      this.now
    );
  }

  async scan(type?: NudgeType): Promise<{ created: number }> {
    const thresholds = this.deps.thresholdsStore.current;
    const engrams = engramsService.loadActiveEngrams(this.deps.db);
    let created = 0;

    if (!type || type === 'consolidation') {
      const { nudges } = await new ConsolidationDetector(
        this.deps.searchService,
        thresholds
      ).detect(engrams);
      created += this.persist(nudges);
    }
    if (!type || type === 'staleness') {
      created += this.persist(new StalenessDetector(thresholds, this.now).detect(engrams).nudges);
    }
    if (!type || type === 'pattern') {
      const { nudges } = await this.buildPatternDetector(thresholds).detect(engrams);
      created += this.persist(nudges);
    }

    nudgeLogService.enforcePendingCap(this.deps.db, thresholds.maxPendingNudges);
    return { created };
  }

  private buildPatternDetector(thresholds: NudgeThresholds): PatternDetector {
    return new PatternDetector({
      thresholds,
      now: this.now,
      contradictionAnalyzer: this.deps.contradictionAnalyzer,
      bodyReader: (engramId) => {
        try {
          return this.deps.engramService.read(engramId).body;
        } catch {
          return null;
        }
      },
    });
  }

  async act(id: string): Promise<{ success: boolean; nudge: Nudge | null }> {
    const nudge = this.get(id);
    if (!nudge || nudge.status !== 'pending') return { success: false, nudge: null };

    if (nudge.action) {
      try {
        await this.executeAction(nudge);
      } catch (err) {
        console.warn(
          `[cerebrum-nudges] act failed for ${id}, leaving pending: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        return { success: false, nudge: null };
      }
    }

    const result = this.deps.db
      .update(nudgeLog)
      .set({ status: 'acted', actedAt: this.now().toISOString() })
      .where(and(eq(nudgeLog.id, id), eq(nudgeLog.status, 'pending')))
      .run();
    return result.changes > 0
      ? { success: true, nudge: this.get(id) }
      : { success: false, nudge: null };
  }

  private async executeAction(nudge: Nudge): Promise<void> {
    if (!nudge.action) return;
    const svc = this.deps.engramService;
    switch (nudge.action.type) {
      case 'consolidate':
        await executeConsolidationAct(nudge, svc, this.synthesizer);
        return;
      case 'archive':
        for (const engramId of nudge.engramIds) svc.update(engramId, { status: 'archived' });
        return;
      case 'review':
        for (const engramId of nudge.engramIds) svc.update(engramId, { customFields: {} });
        return;
      case 'link': {
        const [head, ...rest] = nudge.engramIds;
        if (!head) return;
        for (const other of rest) svc.link(head, other);
        return;
      }
    }
  }

  configure(patch: Partial<NudgeThresholds>): { success: boolean } {
    this.deps.thresholdsStore.current = { ...this.deps.thresholdsStore.current, ...patch };
    return { success: true };
  }
}

export function createNudgeWriteService(deps: NudgeWriteServiceDeps): NudgeWriteService {
  return new NudgeWriteServiceImpl(deps);
}
