/**
 * GliaActionService — CRUD operations for Glia actions and trust state.
 *
 * All write operations update glia_trust_state counters atomically
 * (wrapped in transactions with the corresponding glia_actions update).
 *
 * PRD-086 US-02: Approval Tracking.
 *
 * Read/write split during the migration window (PRD-181 PR 2):
 *  - Pure user-facing reads — `getAction`, `listActions`, `getTrustState`,
 *    `listTrustStates`, `listAutonomousActionsInWindow`,
 *    `countAutonomousExecutionsSince`, `countAutonomousRevertsSince`,
 *    `countRevertsInWindow` — are routed through `readDb` (a
 *    `CerebrumDb` handle, wired to `getCerebrumDrizzle()` in
 *    `instance.ts`) and forwarded to the `@pops/cerebrum-db`
 *    `gliaService` namespace.
 *  - Every write path — `seedTrustStates`, `createAction`,
 *    `decideAction`, `executeAction`, `revertAction`,
 *    `updateTrustState` — and any read-after-write hop (the private
 *    `requireAction` helper used to rehydrate the row we just wrote)
 *    still goes through `db` (the shared `pops.db` handle).
 *    Read-after-write consistency lives on that same store. PRD-181
 *    US-03 flips the writes too, at which point `db` collapses into
 *    `readDb`.
 *
 * Cross-store consistency relies on `backfillCerebrumFromShared()` in
 * `apps/pops-api/src/db/backfill-cerebrum-from-shared.ts`: a one-way,
 * boot-time copy from `pops.db` -> `cerebrum.db` that idempotently
 * fills missing rows on `glia_actions` + `glia_trust_state`. Between
 * boots, newly-written actions live only in `pops.db` and won't appear
 * in the public read methods served from `readDb` until the next deploy
 * reruns the backfill. Read-after-write is preserved within the same
 * process because `requireAction` reads from the write store. This is
 * the same trade-off taken by the engrams (PRD-179 PR 2) and
 * conversations (PRD-182 PR 2) cutovers.
 */
import { eq, sql } from 'drizzle-orm';

import { gliaService, type CerebrumDb } from '@pops/cerebrum-db';
import { gliaActions, gliaTrustState } from '@pops/db-types/schema';

import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors.js';
import { generateActionId, getActionById, getTrustStateByType, toGliaAction } from './helpers.js';
import { ACTION_TYPES } from './types.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type {
  ActionListFilters,
  ActionType,
  CreateActionInput,
  GliaAction,
  GliaTrustState,
  UserDecision,
} from './types.js';

export class GliaActionService {
  private readonly db: BetterSQLite3Database;
  private readonly readDb: CerebrumDb;
  private readonly now: () => Date;

  /**
   * @param db Write handle — shared `pops.db` drizzle wrapper. Every
   *   write path and read-after-write hop routes through this handle
   *   until PRD-181 US-03 flips the writes too.
   * @param now Optional clock injection.
   * @param readDb Optional cerebrum pillar `cerebrum.db` drizzle wrapper.
   *   Pure user-facing reads forward through `@pops/cerebrum-db`'s
   *   `gliaService` against this handle. Defaults to `db` so test rigs
   *   that inject a single in-memory SQLite keep working without churn.
   */
  constructor(db: BetterSQLite3Database, now: () => Date = () => new Date(), readDb?: CerebrumDb) {
    this.db = db;
    this.now = now;
    this.readDb = readDb ?? db;
  }

  /** Seed initial trust states for all four action types. Idempotent. */
  seedTrustStates(): void {
    const timestamp = this.now().toISOString();
    for (const actionType of ACTION_TYPES) {
      this.db
        .insert(gliaTrustState)
        .values({
          actionType,
          currentPhase: 'propose',
          approvedCount: 0,
          rejectedCount: 0,
          revertedCount: 0,
          updatedAt: timestamp,
        })
        .onConflictDoNothing()
        .run();
    }
  }

  /** Create a new Glia action (proposal or autonomous). */
  createAction(input: CreateActionInput): GliaAction {
    if (!ACTION_TYPES.includes(input.actionType)) {
      throw new ValidationError(`Unknown action type: ${input.actionType}`);
    }
    if (!input.affectedIds.length) {
      throw new ValidationError('affectedIds must contain at least one engram ID');
    }

    const timestamp = this.now().toISOString();
    const trustState = getTrustStateByType(this.db, input.actionType);
    if (!trustState) {
      throw new ValidationError(`Trust state not initialized for: ${input.actionType}`);
    }

    const id = generateActionId(input.actionType, timestamp);
    const phase = trustState.currentPhase;
    const isAutonomous = phase === 'act_report' || phase === 'silent';

    const row = {
      id,
      actionType: input.actionType,
      affectedIds: JSON.stringify(input.affectedIds),
      rationale: input.rationale,
      payload: input.payload != null ? JSON.stringify(input.payload) : null,
      phase,
      status: isAutonomous ? 'executed' : 'pending',
      userDecision: null,
      userNote: null,
      executedAt: isAutonomous ? timestamp : null,
      decidedAt: null,
      revertedAt: null,
      createdAt: timestamp,
    };

    this.db.insert(gliaActions).values(row).run();
    return toGliaAction(row);
  }

  /** Record a user decision on a pending action. */
  decideAction(id: string, decision: UserDecision, note?: string): GliaAction {
    const action = this.requireAction(id);
    if (action.status !== 'pending') {
      throw new ConflictError(
        `Cannot decide on action '${id}' — current status is '${action.status}', expected 'pending'`
      );
    }

    const timestamp = this.now().toISOString();
    const isApproval = decision === 'approve' || decision === 'modify';
    const counterField = isApproval ? 'approvedCount' : 'rejectedCount';

    this.db.transaction((tx) => {
      tx.update(gliaActions)
        .set({
          status: isApproval ? 'approved' : 'rejected',
          userDecision: decision,
          userNote: note ?? null,
          decidedAt: timestamp,
        })
        .where(eq(gliaActions.id, id))
        .run();
      tx.update(gliaTrustState)
        .set({ [counterField]: sql`${gliaTrustState[counterField]} + 1`, updatedAt: timestamp })
        .where(eq(gliaTrustState.actionType, action.actionType))
        .run();
    });

    return this.requireAction(id);
  }

  /** Execute an approved action. */
  executeAction(id: string): GliaAction {
    const action = this.requireAction(id);
    if (action.status !== 'approved') {
      throw new ConflictError(
        `Cannot execute action '${id}' — current status is '${action.status}', expected 'approved'`
      );
    }
    this.db
      .update(gliaActions)
      .set({ status: 'executed', executedAt: this.now().toISOString() })
      .where(eq(gliaActions.id, id))
      .run();
    return this.requireAction(id);
  }

  /** Revert an executed action (idempotent for already-reverted). */
  revertAction(id: string): GliaAction {
    const action = this.requireAction(id);
    if (action.status === 'reverted') return action;
    if (action.actionType === 'audit') {
      throw new ValidationError('Audit actions are informational and cannot be reverted');
    }
    if (action.status !== 'executed') {
      throw new ConflictError(
        `Cannot revert action '${id}' — current status is '${action.status}', expected 'executed'`
      );
    }

    const timestamp = this.now().toISOString();
    this.db.transaction((tx) => {
      tx.update(gliaActions)
        .set({ status: 'reverted', revertedAt: timestamp })
        .where(eq(gliaActions.id, id))
        .run();
      tx.update(gliaTrustState)
        .set({
          revertedCount: sql`${gliaTrustState.revertedCount} + 1`,
          lastRevertAt: timestamp,
          updatedAt: timestamp,
        })
        .where(eq(gliaTrustState.actionType, action.actionType))
        .run();
    });
    return this.requireAction(id);
  }

  getAction(id: string): GliaAction | null {
    return gliaService.getAction(this.readDb, id);
  }
  listActions(filters: ActionListFilters = {}): { actions: GliaAction[]; total: number } {
    return gliaService.listActions(this.readDb, filters);
  }
  getTrustState(actionType: ActionType): GliaTrustState | null {
    return gliaService.getTrustState(this.readDb, actionType);
  }
  listTrustStates(): GliaTrustState[] {
    return gliaService.listTrustStates(this.readDb);
  }
  countRevertsInWindow(actionType: ActionType, windowStart: string): number {
    return gliaService.countRevertsInWindow(this.readDb, actionType, windowStart);
  }

  /** Autonomous actions executed in a window (used by the digest). */
  listAutonomousActionsInWindow(startDate: string, endDate: string): GliaAction[] {
    return gliaService.listAutonomousActionsInWindow(this.readDb, startDate, endDate);
  }

  /** Count autonomous executions for a type since a given timestamp. */
  countAutonomousExecutionsSince(actionType: ActionType, sinceIso: string): number {
    return gliaService.countAutonomousExecutionsSince(this.readDb, actionType, sinceIso);
  }

  /** Count autonomous reverts for a type since a given timestamp. */
  countAutonomousRevertsSince(actionType: ActionType, sinceIso: string): number {
    return gliaService.countAutonomousRevertsSince(this.readDb, actionType, sinceIso);
  }

  /** Update trust state directly (used by the trust machine). */
  updateTrustState(
    actionType: ActionType,
    updates: Partial<Omit<GliaTrustState, 'actionType'>>
  ): void {
    this.db
      .update(gliaTrustState)
      .set({ ...updates, updatedAt: this.now().toISOString() })
      .where(eq(gliaTrustState.actionType, actionType))
      .run();
  }

  /**
   * Read-after-write hop. Goes through the write store (`db`) so callers
   * that just wrote a row see it back immediately — `readDb` may not yet
   * reflect the change until the next boot's backfill (see top-of-file
   * JSDoc).
   */
  private requireAction(id: string): GliaAction {
    const action = getActionById(this.db, id);
    if (!action) throw new NotFoundError('GliaAction', id);
    return action;
  }
}
