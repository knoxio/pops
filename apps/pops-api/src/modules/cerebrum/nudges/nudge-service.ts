/**
 * NudgeService (PRD-084) — orchestrator for all nudge detectors.
 *
 * Coordinates consolidation, staleness, and pattern detection, persists
 * nudge candidates to the nudge_log table, and handles cooldown/dedup,
 * pending-cap enforcement, dismiss, and act operations.
 */
import { and, count, eq, sql } from 'drizzle-orm';

import { nudgeLog } from '@pops/db-types';

import { logger } from '../../../lib/logger.js';
import { rowToNudge } from './nudge-helpers.js';
import { enforcePendingCap, loadActiveEngrams, persistCandidates } from './nudge-persistence.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { HybridSearchService } from '../retrieval/hybrid-search.js';
import type { ConsolidationDetector } from './detectors/consolidation.js';
import type { PatternDetector } from './detectors/patterns.js';
import type { StalenessDetector } from './detectors/staleness.js';
import type { NudgeLogRow } from './nudge-helpers.js';
import type { Nudge, NudgeStatus, NudgeThresholds, NudgeType } from './types.js';

export interface NudgeServiceDeps {
  db: BetterSQLite3Database;
  searchService: HybridSearchService;
  consolidationDetector: ConsolidationDetector;
  stalenessDetector: StalenessDetector;
  patternDetector: PatternDetector;
  thresholds: NudgeThresholds;
  now?: () => Date;
}

export interface ListNudgesOptions {
  type?: NudgeType;
  status?: NudgeStatus;
  priority?: Nudge['priority'];
  limit?: number;
  offset?: number;
}

export class NudgeService {
  private readonly db: BetterSQLite3Database;
  private readonly consolidationDetector: ConsolidationDetector;
  private readonly stalenessDetector: StalenessDetector;
  private readonly patternDetector: PatternDetector;
  private readonly thresholds: NudgeThresholds;
  private readonly now: () => Date;

  constructor(deps: NudgeServiceDeps) {
    this.db = deps.db;
    this.consolidationDetector = deps.consolidationDetector;
    this.stalenessDetector = deps.stalenessDetector;
    this.patternDetector = deps.patternDetector;
    this.thresholds = deps.thresholds;
    this.now = deps.now ?? (() => new Date());
  }

  /** Run a full nudge scan, optionally filtered by type. */
  async scan(type?: NudgeType): Promise<{ created: number }> {
    const engrams = loadActiveEngrams(this.db);
    let totalCreated = 0;

    if (!type || type === 'consolidation') {
      totalCreated += persistCandidates(
        this.db,
        (await this.consolidationDetector.detect(engrams)).nudges,
        this.thresholds,
        this.now
      );
    }
    if (!type || type === 'staleness') {
      totalCreated += persistCandidates(
        this.db,
        this.stalenessDetector.detect(engrams).nudges,
        this.thresholds,
        this.now
      );
    }
    if (!type || type === 'pattern') {
      totalCreated += persistCandidates(
        this.db,
        this.patternDetector.detect(engrams).nudges,
        this.thresholds,
        this.now
      );
    }

    enforcePendingCap(this.db, this.thresholds.maxPendingNudges);
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
      nudges: rows.map((r) => rowToNudge(r as unknown as NudgeLogRow)),
      total: totalRow?.total ?? 0,
    };
  }

  /** Get a single nudge by ID. */
  get(id: string): Nudge | null {
    const [row] = this.db.select().from(nudgeLog).where(eq(nudgeLog.id, id)).all();
    return row ? rowToNudge(row as unknown as NudgeLogRow) : null;
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

  /** Mark a nudge as acted. The caller executes the action externally. */
  act(id: string): { success: boolean; nudge: Nudge | null } {
    const result = this.db
      .update(nudgeLog)
      .set({ status: 'acted', actedAt: this.now().toISOString() })
      .where(and(eq(nudgeLog.id, id), eq(nudgeLog.status, 'pending')))
      .run();
    return result.changes > 0
      ? { success: true, nudge: this.get(id) }
      : { success: false, nudge: null };
  }

  /** Update detection thresholds. */
  configure(thresholds: Partial<NudgeThresholds>): { success: boolean } {
    Object.assign(this.thresholds, thresholds);
    return { success: true };
  }
}
