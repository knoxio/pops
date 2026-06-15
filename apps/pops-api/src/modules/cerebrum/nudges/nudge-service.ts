/**
 * NudgeService (PRD-084) — orchestrator for all nudge detectors.
 *
 * Coordinates consolidation, staleness, and pattern detection, persists
 * nudge candidates to the nudge_log table, and handles cooldown/dedup,
 * pending-cap enforcement, dismiss, and act operations.
 */
import { and, count, eq, sql } from 'drizzle-orm';

import { nudgeLogService, rowToNudge, type CerebrumDb } from '@pops/cerebrum-db';
import { nudgeLog } from '@pops/cerebrum-db';

import { logger } from '../../../lib/logger.js';
import { ConcatenationSynthesizer, executeConsolidationAct } from './consolidation-act.js';
import { loadActiveEngrams } from './nudge-persistence.js';

import type { EngramService } from '../engrams/service.js';
import type { HybridSearchService } from '../retrieval/hybrid-search.js';
import type { BodySynthesizer } from './consolidation-act.js';
import type { ConsolidationDetector } from './detectors/consolidation.js';
import type { PatternDetector } from './detectors/patterns.js';
import type { StalenessDetector } from './detectors/staleness.js';
import type { Nudge, NudgeStatus, NudgeThresholds, NudgeType } from './types.js';

export interface NudgeServiceDeps {
  /**
   * Cerebrum pillar drizzle handle. Owns `nudge_log` reads/writes after
   * the Phase 2 PR 3 cutover. The shared pops.db copy stays populated
   * during the transitional release cycle (the drift guard + the
   * idempotent boot-time backfill keep both in lockstep) until the
   * deletion PR retires the cerebrum-owned tags from the shared journal.
   */
  db: CerebrumDb;
  /**
   * Engrams-source drizzle handle. Today this is the shared pops.db
   * because `loadActiveEngrams` reads `engram_index` / `engram_scopes` /
   * `engram_tags` — cerebrum-owned tables that have not yet migrated to
   * `cerebrum.db`. When the engrams slice migrates this collapses back
   * to a single handle and this field is removed.
   *
   * Defaults to `db` so callers that do not split (tests, single-DB
   * fixtures) keep working without code changes.
   */
  engramsDb?: CerebrumDb;
  searchService: HybridSearchService;
  consolidationDetector: ConsolidationDetector;
  stalenessDetector: StalenessDetector;
  patternDetector: PatternDetector;
  thresholds: NudgeThresholds;
  now?: () => Date;
  /**
   * Optional EngramService used by `act` to execute the suggested action
   * (consolidate / archive / review). When omitted the service still marks
   * the nudge as `acted` but performs no domain side effects.
   */
  engramService?: EngramService;
  /** Optional synthesizer override for consolidation acts. */
  synthesizer?: BodySynthesizer;
}

export interface ListNudgesOptions {
  type?: NudgeType;
  status?: NudgeStatus;
  priority?: Nudge['priority'];
  limit?: number;
  offset?: number;
}

export class NudgeService {
  private readonly db: CerebrumDb;
  private readonly engramsDb: CerebrumDb;
  private readonly consolidationDetector: ConsolidationDetector;
  private readonly stalenessDetector: StalenessDetector;
  private readonly patternDetector: PatternDetector;
  private readonly thresholds: NudgeThresholds;
  private readonly now: () => Date;
  private readonly engramService: EngramService | undefined;
  private readonly synthesizer: BodySynthesizer;

  constructor(deps: NudgeServiceDeps) {
    this.db = deps.db;
    this.engramsDb = deps.engramsDb ?? deps.db;
    this.consolidationDetector = deps.consolidationDetector;
    this.stalenessDetector = deps.stalenessDetector;
    this.patternDetector = deps.patternDetector;
    this.thresholds = deps.thresholds;
    this.now = deps.now ?? (() => new Date());
    this.engramService = deps.engramService;
    this.synthesizer = deps.synthesizer ?? new ConcatenationSynthesizer();
  }

  /** Run a full nudge scan, optionally filtered by type. */
  async scan(type?: NudgeType): Promise<{ created: number }> {
    const engrams = loadActiveEngrams(this.engramsDb);
    let totalCreated = 0;

    if (!type || type === 'consolidation') {
      totalCreated += nudgeLogService.persistCandidates(
        this.db,
        (await this.consolidationDetector.detect(engrams)).nudges,
        this.thresholds,
        this.now
      );
    }
    if (!type || type === 'staleness') {
      totalCreated += nudgeLogService.persistCandidates(
        this.db,
        this.stalenessDetector.detect(engrams).nudges,
        this.thresholds,
        this.now
      );
    }
    if (!type || type === 'pattern') {
      totalCreated += nudgeLogService.persistCandidates(
        this.db,
        (await this.patternDetector.detect(engrams)).nudges,
        this.thresholds,
        this.now
      );
    }

    const expired = nudgeLogService.enforcePendingCap(this.db, this.thresholds.maxPendingNudges);
    if (expired > 0) {
      logger.info({ expired }, '[NudgeService] Expired oldest pending nudges');
    }
    logger.info({ created: totalCreated, type: type ?? 'all' }, '[NudgeService] Scan complete');
    return { created: totalCreated };
  }

  /** List nudges with optional filters. */
  list(opts: ListNudgesOptions = {}): { nudges: Nudge[]; total: number } {
    const conditions = [];
    if (opts.type) conditions.push(eq(nudgeLog.type, opts.type));
    if (opts.status) conditions.push(eq(nudgeLog.status, opts.status));
    if (opts.priority) conditions.push(eq(nudgeLog.priority, opts.priority));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const baseQuery = this.db.select().from(nudgeLog);
    const rows = (where ? baseQuery.where(where) : baseQuery)
      .orderBy(sql`${nudgeLog.createdAt} desc`)
      .limit(limit)
      .offset(offset)
      .all();

    const countQuery = this.db.select({ total: count() }).from(nudgeLog);
    const [totalRow] = (where ? countQuery.where(where) : countQuery).all();

    return {
      nudges: rows.map((r) => rowToNudge(r)),
      total: totalRow?.total ?? 0,
    };
  }

  /** List contradiction pattern nudges with SQL-level filtering. */
  listContradictions(opts: { status?: NudgeStatus | null; limit?: number; offset?: number } = {}): {
    nudges: Nudge[];
    total: number;
  } {
    return nudgeLogService.listContradictions(this.db, opts);
  }

  /** Get a single nudge by ID. */
  get(id: string): Nudge | null {
    const [row] = this.db.select().from(nudgeLog).where(eq(nudgeLog.id, id)).all();
    return row ? rowToNudge(row) : null;
  }

  /** Dismiss a nudge — permanently mark it as dismissed. */
  dismiss(id: string): { success: boolean } {
    const result = this.db
      .update(nudgeLog)
      .set({ status: 'dismissed' })
      .where(and(eq(nudgeLog.id, id), eq(nudgeLog.status, 'pending')))
      .run();
    return { success: result.changes > 0 };
  }

  /**
   * Act on a pending nudge: execute the suggested action then mark the
   * nudge as `acted`. Supported actions:
   *   - `consolidate`: synthesise a merged engram and archive sources
   *     (PRD-084 US-01 AC #5).
   *   - `archive`: set the source engram(s) to `status: archived`
   *     (PRD-084 US-02 AC #6 — staleness archive).
   *   - `review`: bump the engram's `modified_at` timestamp via a no-op
   *     update so the staleness clock resets (PRD-084 US-02 AC #6 — review).
   *   - `link`: link the affected engrams pairwise.
   *
   * If the engramService dependency is not configured, the nudge is still
   * marked acted (so dismissal semantics remain correct) but a warning is
   * logged.
   */
  async act(id: string): Promise<{ success: boolean; nudge: Nudge | null }> {
    const nudge = this.get(id);
    if (!nudge || nudge.status !== 'pending') {
      return { success: false, nudge: null };
    }

    if (nudge.action && this.engramService) {
      try {
        await this.executeNudgeAction(nudge);
      } catch (err) {
        logger.error(
          { nudgeId: id, error: err instanceof Error ? err.message : String(err) },
          '[NudgeService] act failed — leaving nudge pending'
        );
        return { success: false, nudge: null };
      }
    } else if (nudge.action && !this.engramService) {
      logger.warn(
        { nudgeId: id, actionType: nudge.action.type },
        '[NudgeService] act called without engramService — nudge will be marked acted with no side effects'
      );
    }

    const result = this.db
      .update(nudgeLog)
      .set({ status: 'acted', actedAt: this.now().toISOString() })
      .where(and(eq(nudgeLog.id, id), eq(nudgeLog.status, 'pending')))
      .run();
    return result.changes > 0
      ? { success: true, nudge: this.get(id) }
      : { success: false, nudge: null };
  }

  /** Dispatch the suggested action to its handler. */
  private async executeNudgeAction(nudge: Nudge): Promise<void> {
    if (!this.engramService) return;
    if (!nudge.action) return;
    const svc = this.engramService;
    switch (nudge.action.type) {
      case 'consolidate':
        await executeConsolidationAct(nudge, svc, this.synthesizer);
        return;
      case 'archive':
        for (const engramId of nudge.engramIds) {
          svc.update(engramId, { status: 'archived' });
        }
        return;
      case 'review':
        // Resetting the staleness clock = touching `modified_at`. The service
        // bumps `modified_at` on every update so an empty customFields patch
        // is sufficient.
        for (const engramId of nudge.engramIds) {
          svc.update(engramId, { customFields: {} });
        }
        return;
      case 'link': {
        // Link the first engram to every other engram in the cluster so
        // any pair is reachable through the bidirectional link table.
        const [head, ...rest] = nudge.engramIds;
        if (!head) return;
        for (const other of rest) {
          svc.link(head, other);
        }
        return;
      }
    }
  }

  /** Update detection thresholds. */
  configure(thresholds: Partial<NudgeThresholds>): { success: boolean } {
    Object.assign(this.thresholds, thresholds);
    return { success: true };
  }
}
