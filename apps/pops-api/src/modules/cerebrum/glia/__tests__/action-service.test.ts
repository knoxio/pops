/**
 * GliaActionService unit tests.
 *
 * Tests the full action lifecycle: create, decide, execute, revert.
 * Also verifies trust state counter updates, validation, and edge cases.
 *
 * PRD-086 US-02: Approval Tracking.
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../../../../shared/test-utils.js';
import { GliaActionService } from '../action-service.js';

import type { Database } from 'better-sqlite3';

/** Fixed clock that advances one second per call. */
function makeClock(start = new Date('2026-04-27T10:00:00Z')): () => Date {
  let t = start.getTime();
  return () => {
    const d = new Date(t);
    t += 1_000;
    return d;
  };
}

describe('GliaActionService', () => {
  let db: Database;
  let svc: GliaActionService;

  beforeEach(() => {
    db = createTestDb();
    svc = new GliaActionService(drizzle<Record<string, unknown>>(db), makeClock());
    svc.seedTrustStates();
  });

  afterEach(() => {
    db.close();
  });

  // -----------------------------------------------------------------------
  // seedTrustStates
  // -----------------------------------------------------------------------

  describe('seedTrustStates', () => {
    it('creates trust state rows for all four action types', () => {
      const states = svc.listTrustStates();
      expect(states).toHaveLength(4);

      const types = states.map((s) => s.actionType).toSorted();
      expect(types).toEqual(['audit', 'consolidate', 'link', 'prune']);

      for (const state of states) {
        expect(state.currentPhase).toBe('propose');
        expect(state.approvedCount).toBe(0);
        expect(state.rejectedCount).toBe(0);
        expect(state.revertedCount).toBe(0);
        expect(state.autonomousSince).toBeNull();
        expect(state.lastRevertAt).toBeNull();
        expect(state.graduatedAt).toBeNull();
      }
    });

    it('is idempotent — does not overwrite existing state', () => {
      // Modify a state
      svc.updateTrustState('prune', { approvedCount: 5 });

      // Re-seed
      svc.seedTrustStates();

      const pruneState = svc.getTrustState('prune');
      expect(pruneState?.approvedCount).toBe(5);
    });
  });

  // -----------------------------------------------------------------------
  // createAction
  // -----------------------------------------------------------------------

  describe('createAction', () => {
    it('creates a pending action in propose phase', () => {
      const action = svc.createAction({
        actionType: 'prune',
        affectedIds: ['engram_001'],
        rationale: 'Stale engram with 0 references',
      });

      expect(action.id).toMatch(/^glia_prune_\d+_\w+$/);
      expect(action.actionType).toBe('prune');
      expect(action.affectedIds).toEqual(['engram_001']);
      expect(action.rationale).toBe('Stale engram with 0 references');
      expect(action.phase).toBe('propose');
      expect(action.status).toBe('pending');
      expect(action.userDecision).toBeNull();
      expect(action.executedAt).toBeNull();
    });

    it('stores payload as JSON', () => {
      const action = svc.createAction({
        actionType: 'consolidate',
        affectedIds: ['engram_001', 'engram_002'],
        rationale: 'Merge near-duplicates',
        payload: { mergedContent: 'Combined text', sourceIds: ['engram_001', 'engram_002'] },
      });

      expect(action.payload).toEqual({
        mergedContent: 'Combined text',
        sourceIds: ['engram_001', 'engram_002'],
      });
    });

    it('rejects unknown action type', () => {
      expect(() =>
        svc.createAction({
          actionType: 'destroy' as 'prune',
          affectedIds: ['engram_001'],
          rationale: 'test',
        })
      ).toThrow('Validation failed');
    });

    it('rejects empty affectedIds', () => {
      expect(() =>
        svc.createAction({
          actionType: 'prune',
          affectedIds: [],
          rationale: 'test',
        })
      ).toThrow('Validation failed');
    });

    it('creates autonomous actions when in act_report phase', () => {
      svc.updateTrustState('link', { currentPhase: 'act_report' });

      const action = svc.createAction({
        actionType: 'link',
        affectedIds: ['e1', 'e2'],
        rationale: 'Cross-reference discovered',
      });

      expect(action.status).toBe('executed');
      expect(action.executedAt).not.toBeNull();
      expect(action.phase).toBe('act_report');
    });

    it('creates autonomous actions when in silent phase', () => {
      svc.updateTrustState('audit', { currentPhase: 'silent' });

      const action = svc.createAction({
        actionType: 'audit',
        affectedIds: ['e1'],
        rationale: 'Quality score below threshold',
      });

      expect(action.status).toBe('executed');
      expect(action.phase).toBe('silent');
    });
  });

  // -----------------------------------------------------------------------
  // decideAction
  // -----------------------------------------------------------------------

  describe('decideAction', () => {
    it('approves a pending action and increments approvedCount', () => {
      const action = svc.createAction({
        actionType: 'prune',
        affectedIds: ['e1'],
        rationale: 'test',
      });

      const decided = svc.decideAction(action.id, 'approve');

      expect(decided.status).toBe('approved');
      expect(decided.userDecision).toBe('approve');
      expect(decided.decidedAt).not.toBeNull();

      const state = svc.getTrustState('prune');
      expect(state?.approvedCount).toBe(1);
    });

    it('records modify decision as approval', () => {
      const action = svc.createAction({
        actionType: 'prune',
        affectedIds: ['e1'],
        rationale: 'test',
      });

      const decided = svc.decideAction(action.id, 'modify', 'Adjusted merge plan');

      expect(decided.status).toBe('approved');
      expect(decided.userDecision).toBe('modify');
      expect(decided.userNote).toBe('Adjusted merge plan');

      const state = svc.getTrustState('prune');
      expect(state?.approvedCount).toBe(1);
    });

    it('rejects a pending action and increments rejectedCount', () => {
      const action = svc.createAction({
        actionType: 'link',
        affectedIds: ['e1', 'e2'],
        rationale: 'test',
      });

      const decided = svc.decideAction(action.id, 'reject', 'Not related');

      expect(decided.status).toBe('rejected');
      expect(decided.userDecision).toBe('reject');
      expect(decided.userNote).toBe('Not related');

      const state = svc.getTrustState('link');
      expect(state?.rejectedCount).toBe(1);
    });

    it('rejects deciding on a non-pending action', () => {
      const action = svc.createAction({
        actionType: 'prune',
        affectedIds: ['e1'],
        rationale: 'test',
      });
      svc.decideAction(action.id, 'approve');

      expect(() => svc.decideAction(action.id, 'approve')).toThrow(/current status is 'approved'/);
    });

    it('throws not found for unknown action ID', () => {
      expect(() => svc.decideAction('nonexistent', 'approve')).toThrow('not found');
    });
  });

  // -----------------------------------------------------------------------
  // executeAction
  // -----------------------------------------------------------------------

  describe('executeAction', () => {
    it('executes an approved action', () => {
      const action = svc.createAction({
        actionType: 'prune',
        affectedIds: ['e1'],
        rationale: 'test',
      });
      svc.decideAction(action.id, 'approve');

      const executed = svc.executeAction(action.id);

      expect(executed.status).toBe('executed');
      expect(executed.executedAt).not.toBeNull();
    });

    it('rejects executing a non-approved action', () => {
      const action = svc.createAction({
        actionType: 'prune',
        affectedIds: ['e1'],
        rationale: 'test',
      });

      expect(() => svc.executeAction(action.id)).toThrow(
        /current status is 'pending', expected 'approved'/
      );
    });

    it('throws not found for unknown action ID', () => {
      expect(() => svc.executeAction('nonexistent')).toThrow('not found');
    });
  });

  // -----------------------------------------------------------------------
  // revertAction
  // -----------------------------------------------------------------------

  describe('revertAction', () => {
    it('reverts an executed action and updates counters', () => {
      const action = svc.createAction({
        actionType: 'prune',
        affectedIds: ['e1'],
        rationale: 'test',
      });
      svc.decideAction(action.id, 'approve');
      svc.executeAction(action.id);

      const reverted = svc.revertAction(action.id);

      expect(reverted.status).toBe('reverted');
      expect(reverted.revertedAt).not.toBeNull();

      const state = svc.getTrustState('prune');
      expect(state?.revertedCount).toBe(1);
      expect(state?.lastRevertAt).not.toBeNull();
    });

    it('is idempotent for already-reverted actions', () => {
      const action = svc.createAction({
        actionType: 'link',
        affectedIds: ['e1', 'e2'],
        rationale: 'test',
      });
      svc.decideAction(action.id, 'approve');
      svc.executeAction(action.id);

      const first = svc.revertAction(action.id);
      const second = svc.revertAction(action.id);

      expect(second.status).toBe('reverted');
      expect(second.revertedAt).toBe(first.revertedAt);

      // Counter should only have been incremented once
      const state = svc.getTrustState('link');
      expect(state?.revertedCount).toBe(1);
    });

    it('rejects reverting an audit action', () => {
      const action = svc.createAction({
        actionType: 'audit',
        affectedIds: ['e1'],
        rationale: 'test',
      });
      svc.decideAction(action.id, 'approve');
      svc.executeAction(action.id);

      expect(() => svc.revertAction(action.id)).toThrow('Validation failed');
    });

    it('rejects reverting a non-executed action', () => {
      const action = svc.createAction({
        actionType: 'prune',
        affectedIds: ['e1'],
        rationale: 'test',
      });

      expect(() => svc.revertAction(action.id)).toThrow(
        /current status is 'pending', expected 'executed'/
      );
    });
  });

  // -----------------------------------------------------------------------
  // listActions
  // -----------------------------------------------------------------------

  describe('listActions', () => {
    it('returns all actions sorted by creation date descending', () => {
      svc.createAction({ actionType: 'prune', affectedIds: ['e1'], rationale: 'first' });
      svc.createAction({ actionType: 'link', affectedIds: ['e2'], rationale: 'second' });
      svc.createAction({ actionType: 'audit', affectedIds: ['e3'], rationale: 'third' });

      const { actions, total } = svc.listActions();

      expect(total).toBe(3);
      expect(actions).toHaveLength(3);
      // Most recent first
      expect(actions.at(0)?.rationale).toBe('third');
      expect(actions.at(2)?.rationale).toBe('first');
    });

    it('filters by action type', () => {
      svc.createAction({ actionType: 'prune', affectedIds: ['e1'], rationale: 'r1' });
      svc.createAction({ actionType: 'link', affectedIds: ['e2'], rationale: 'r2' });

      const { actions, total } = svc.listActions({ actionType: 'prune' });

      expect(total).toBe(1);
      expect(actions.at(0)?.actionType).toBe('prune');
    });

    it('filters by status', () => {
      const a1 = svc.createAction({ actionType: 'prune', affectedIds: ['e1'], rationale: 'r1' });
      svc.createAction({ actionType: 'link', affectedIds: ['e2'], rationale: 'r2' });
      svc.decideAction(a1.id, 'approve');

      const { actions, total } = svc.listActions({ status: 'approved' });

      expect(total).toBe(1);
      expect(actions.at(0)?.status).toBe('approved');
    });

    it('supports pagination', () => {
      for (let i = 0; i < 5; i++) {
        svc.createAction({ actionType: 'prune', affectedIds: ['e1'], rationale: `r${i}` });
      }

      const page1 = svc.listActions({ limit: 2, offset: 0 });
      const page2 = svc.listActions({ limit: 2, offset: 2 });

      expect(page1.total).toBe(5);
      expect(page1.actions).toHaveLength(2);
      expect(page2.actions).toHaveLength(2);
      // No overlap
      expect(page1.actions.at(0)?.id).not.toBe(page2.actions.at(0)?.id);
    });
  });

  // -----------------------------------------------------------------------
  // getTrustState / listTrustStates
  // -----------------------------------------------------------------------

  describe('getTrustState', () => {
    it('returns trust state for a known action type', () => {
      const state = svc.getTrustState('prune');

      expect(state).not.toBeNull();
      expect(state?.actionType).toBe('prune');
      expect(state?.currentPhase).toBe('propose');
    });

    it('returns null for an unknown action type', () => {
      const state = svc.getTrustState('nonexistent' as 'prune');
      expect(state).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // countRevertsInWindow
  // -----------------------------------------------------------------------

  describe('countRevertsInWindow', () => {
    it('counts reverts within the window', () => {
      // Create and revert two actions
      const a1 = svc.createAction({ actionType: 'prune', affectedIds: ['e1'], rationale: 'r1' });
      svc.decideAction(a1.id, 'approve');
      svc.executeAction(a1.id);
      svc.revertAction(a1.id);

      const a2 = svc.createAction({ actionType: 'prune', affectedIds: ['e2'], rationale: 'r2' });
      svc.decideAction(a2.id, 'approve');
      svc.executeAction(a2.id);
      svc.revertAction(a2.id);

      // Count from before the first action was created
      const count = svc.countRevertsInWindow('prune', '2026-04-27T09:00:00Z');
      expect(count).toBe(2);
    });

    it('excludes reverts outside the window', () => {
      const a1 = svc.createAction({ actionType: 'prune', affectedIds: ['e1'], rationale: 'r1' });
      svc.decideAction(a1.id, 'approve');
      svc.executeAction(a1.id);
      svc.revertAction(a1.id);

      // Window starts after the revert
      const count = svc.countRevertsInWindow('prune', '2026-04-28T00:00:00Z');
      expect(count).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Full lifecycle
  // -----------------------------------------------------------------------

  describe('full lifecycle', () => {
    it('create → approve → execute → revert', () => {
      const created = svc.createAction({
        actionType: 'consolidate',
        affectedIds: ['e1', 'e2'],
        rationale: 'Near-duplicate engrams',
        payload: { mergedContent: 'Combined text' },
      });
      expect(created.status).toBe('pending');

      const approved = svc.decideAction(created.id, 'approve');
      expect(approved.status).toBe('approved');

      const executed = svc.executeAction(created.id);
      expect(executed.status).toBe('executed');

      const reverted = svc.revertAction(created.id);
      expect(reverted.status).toBe('reverted');

      const state = svc.getTrustState('consolidate');
      expect(state?.approvedCount).toBe(1);
      expect(state?.revertedCount).toBe(1);
    });
  });
});
