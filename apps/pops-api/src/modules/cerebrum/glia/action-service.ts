/**
 * GliaActionService — CRUD operations for Glia actions and trust state.
 *
 * All write operations update glia_trust_state counters atomically
 * (wrapped in transactions with the corresponding glia_actions update).
 *
 * PRD-086 US-02: Approval Tracking.
 */
import { eq, sql } from 'drizzle-orm';

import { gliaActions, gliaTrustState } from '@pops/db-types/schema';

import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors.js';
import {
  countAutonomousExecutionsSince,
  countAutonomousRevertsSince,
  countRevertsInWindow,
  generateActionId,
  getActionById,
  getTrustStateByType,
  listAllTrustStates,
  listAutonomousActionsInWindow,
  queryActions,
  toGliaAction,
} from './helpers.js';
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
  constructor(
    private readonly db: BetterSQLite3Database,
    private readonly now: () => Date = () => new Date()
  ) {}

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
    const trustState = this.getTrustState(input.actionType);
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
    return getActionById(this.db, id);
  }
  listActions(filters: ActionListFilters = {}): { actions: GliaAction[]; total: number } {
    return queryActions(this.db, filters);
  }
  getTrustState(actionType: ActionType): GliaTrustState | null {
    return getTrustStateByType(this.db, actionType);
  }
  listTrustStates(): GliaTrustState[] {
    return listAllTrustStates(this.db);
  }
  countRevertsInWindow(actionType: ActionType, windowStart: string): number {
    return countRevertsInWindow(this.db, actionType, windowStart);
  }

  /** Autonomous actions executed in a window (used by the digest). */
  listAutonomousActionsInWindow(startDate: string, endDate: string): GliaAction[] {
    return listAutonomousActionsInWindow(this.db, startDate, endDate);
  }

  /** Count autonomous executions for a type since a given timestamp. */
  countAutonomousExecutionsSince(actionType: ActionType, sinceIso: string): number {
    return countAutonomousExecutionsSince(this.db, actionType, sinceIso);
  }

  /** Count autonomous reverts for a type since a given timestamp. */
  countAutonomousRevertsSince(actionType: ActionType, sinceIso: string): number {
    return countAutonomousRevertsSince(this.db, actionType, sinceIso);
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

  private requireAction(id: string): GliaAction {
    const action = this.getAction(id);
    if (!action) throw new NotFoundError('GliaAction', id);
    return action;
  }
}
