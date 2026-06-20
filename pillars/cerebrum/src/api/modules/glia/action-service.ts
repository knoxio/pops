/**
 * GliaActionService — CRUD over `glia_actions` + `glia_trust_state`.
 *
 * The constructor takes a `CerebrumDb` handle (the injected pillar handle, or
 * a transaction handle for the atomic decide/revert paths). All write
 * operations that mutate trust-state counters wrap the action update and the
 * counter increment in a single `db.transaction(...)` so a partial failure
 * never leaves the counters out of step with the action rows.
 *
 * Reads + writes route through the `gliaService` data-access namespace in the
 * pillar db package — the SQL seam stays pure data-access; the trust-machine
 * orchestration lives in `./trust-machine.ts`.
 */
import { gliaService, type CerebrumDb } from '../../../db/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { generateActionId } from './helpers.js';
import { ACTION_TYPES } from './types.js';

import type {
  ActionListFilters,
  ActionType,
  CreateActionInput,
  GliaAction,
  GliaTrustState,
  UserDecision,
} from './types.js';

export class GliaActionService {
  private readonly db: CerebrumDb;
  private readonly now: () => Date;

  constructor(db: CerebrumDb, now: () => Date = () => new Date()) {
    this.db = db;
    this.now = now;
  }

  /** Seed initial trust states for all four action types. Idempotent. */
  seedTrustStates(): void {
    const timestamp = this.now().toISOString();
    for (const actionType of ACTION_TYPES) {
      gliaService.seedTrustState(this.db, {
        actionType,
        currentPhase: 'propose',
        approvedCount: 0,
        rejectedCount: 0,
        revertedCount: 0,
        updatedAt: timestamp,
      });
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
    const trustState = gliaService.getTrustState(this.db, input.actionType);
    if (!trustState) {
      throw new ValidationError(`Trust state not initialized for: ${input.actionType}`);
    }

    const id = generateActionId(input.actionType, timestamp);
    const phase = trustState.currentPhase;
    const isAutonomous = phase === 'act_report' || phase === 'silent';

    return gliaService.insertAction(this.db, {
      id,
      actionType: input.actionType,
      affectedIds: input.affectedIds,
      rationale: input.rationale,
      payload: input.payload ?? null,
      phase,
      status: isAutonomous ? 'executed' : 'pending',
      executedAt: isAutonomous ? timestamp : null,
      createdAt: timestamp,
    });
  }

  /** Record a user decision on a pending action (transactional). */
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
      gliaService.updateAction(tx, id, {
        status: isApproval ? 'approved' : 'rejected',
        userDecision: decision,
        userNote: note ?? null,
        decidedAt: timestamp,
      });
      gliaService.incrementTrustStateCounter(tx, action.actionType, counterField, timestamp);
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
    gliaService.updateAction(this.db, id, {
      status: 'executed',
      executedAt: this.now().toISOString(),
    });
    return this.requireAction(id);
  }

  /** Revert an executed action (idempotent for already-reverted; transactional). */
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
      gliaService.updateAction(tx, id, { status: 'reverted', revertedAt: timestamp });
      gliaService.incrementTrustStateCounter(tx, action.actionType, 'revertedCount', timestamp);
      gliaService.updateTrustState(tx, action.actionType, {
        lastRevertAt: timestamp,
        updatedAt: timestamp,
      });
    });
    return this.requireAction(id);
  }

  getAction(id: string): GliaAction | null {
    return gliaService.getAction(this.db, id);
  }
  listActions(filters: ActionListFilters = {}): { actions: GliaAction[]; total: number } {
    return gliaService.listActions(this.db, filters);
  }
  getTrustState(actionType: ActionType): GliaTrustState | null {
    return gliaService.getTrustState(this.db, actionType);
  }
  listTrustStates(): GliaTrustState[] {
    return gliaService.listTrustStates(this.db);
  }
  countRevertsInWindow(actionType: ActionType, windowStart: string): number {
    return gliaService.countRevertsInWindow(this.db, actionType, windowStart);
  }

  /** Autonomous actions executed in a window (used by the digest). */
  listAutonomousActionsInWindow(startDate: string, endDate: string): GliaAction[] {
    return gliaService.listAutonomousActionsInWindow(this.db, startDate, endDate);
  }

  /** Count autonomous executions for a type since a given timestamp. */
  countAutonomousExecutionsSince(actionType: ActionType, sinceIso: string): number {
    return gliaService.countAutonomousExecutionsSince(this.db, actionType, sinceIso);
  }

  /** Count autonomous reverts for a type since a given timestamp. */
  countAutonomousRevertsSince(actionType: ActionType, sinceIso: string): number {
    return gliaService.countAutonomousRevertsSince(this.db, actionType, sinceIso);
  }

  /** Update trust state directly (used by the trust machine). */
  updateTrustState(
    actionType: ActionType,
    updates: Partial<Omit<GliaTrustState, 'actionType'>>
  ): void {
    gliaService.updateTrustState(this.db, actionType, {
      ...updates,
      updatedAt: this.now().toISOString(),
    });
  }

  private requireAction(id: string): GliaAction {
    const action = gliaService.getAction(this.db, id);
    if (!action) throw new NotFoundError('GliaAction', id);
    return action;
  }
}
