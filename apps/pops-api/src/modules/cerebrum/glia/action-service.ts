/**
 * GliaActionService — CRUD operations for Glia actions and trust state.
 *
 * All write operations update glia_trust_state counters atomically
 * (wrapped in transactions with the corresponding glia_actions update).
 *
 * PRD-086 US-02: Approval Tracking.
 *
 * PRD-181 PR 3 (this PR) collapses the read/write split established by
 * PR 2: every path — `seedTrustStates`, `createAction`, `decideAction`,
 * `executeAction`, `revertAction`, `updateTrustState`, plus the
 * read-after-write hop inside `requireAction` and every read method —
 * now routes through a single `CerebrumDb` handle wired to
 * `getCerebrumDrizzle()` in `instance.ts`. The boot-time backfill
 * (`backfillCerebrumFromShared()` in
 * `apps/pops-api/src/db/backfill-cerebrum-from-shared.ts`) carries any
 * residual rows on the legacy shared `pops.db` forward on the first
 * deploy after the cut. Subsequent boots are no-ops via the per-table
 * existence filter; a follow-up PR retires the backfill and drops the
 * shared-journal shim.
 *
 * The TOML config loader + threshold reads from
 * `engrams/.config/glia.toml` (see `toml-config.ts` / `types.ts`) stay
 * in pops-api — `@pops/cerebrum-db` is pure data-access.
 */
import { gliaService, type CerebrumDb } from '@pops/cerebrum-db';

import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors.js';
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

  /**
   * @param db Cerebrum pillar drizzle handle (`getCerebrumDrizzle()` in
   *   production). After PRD-181 PR 3 every glia read and write —
   *   including the read-after-write hop inside `requireAction` — flows
   *   through this single handle.
   * @param now Optional clock injection.
   */
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

  /** Read-after-write hop on the same cerebrum store as the writes. */
  private requireAction(id: string): GliaAction {
    const action = gliaService.getAction(this.db, id);
    if (!action) throw new NotFoundError('GliaAction', id);
    return action;
  }
}
