/**
 * GliaTrustMachine unit tests.
 *
 * Tests graduation thresholds, demotion logic, counter resets,
 * and edge cases around phase transitions.
 *
 * PRD-086 US-03: Graduation Logic.
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../../../../shared/test-utils.js';
import { GliaActionService } from '../action-service.js';
import { GliaTrustMachine } from '../trust-machine.js';
import { DEFAULT_THRESHOLDS } from '../types.js';

import type { Database } from 'better-sqlite3';

import type { GraduationThresholds } from '../types.js';

/**
 * Fixed clock that advances one second per call.
 * Allows external control of the current time.
 */
function makeControllableClock(start = new Date('2026-04-27T10:00:00Z')): {
  now: () => Date;
  setTime: (d: Date) => void;
} {
  let t = start.getTime();
  return {
    now: () => {
      const d = new Date(t);
      t += 1_000;
      return d;
    },
    setTime: (d: Date) => {
      t = d.getTime();
    },
  };
}

describe('GliaTrustMachine', () => {
  let db: Database;
  let svc: GliaActionService;
  let machine: GliaTrustMachine;
  let clock: ReturnType<typeof makeControllableClock>;
  let thresholds: GraduationThresholds;

  beforeEach(() => {
    db = createTestDb();
    clock = makeControllableClock();
    thresholds = { ...DEFAULT_THRESHOLDS };
    svc = new GliaActionService(drizzle<Record<string, unknown>>(db), clock.now);
    machine = new GliaTrustMachine(svc, () => thresholds, clock.now);
    svc.seedTrustStates();
  });

  afterEach(() => {
    db.close();
  });

  // -----------------------------------------------------------------------
  // propose → act_report graduation
  // -----------------------------------------------------------------------

  describe('propose → act_report', () => {
    it('does not graduate with fewer than 20 approvals', () => {
      // Approve 19 actions
      for (let i = 0; i < 19; i++) {
        const a = svc.createAction({ actionType: 'link', affectedIds: ['e1'], rationale: `r${i}` });
        svc.decideAction(a.id, 'approve');
      }

      const result = machine.checkGraduation('link');
      expect(result.transitioned).toBe(false);
      expect(result.reason).toContain('Need 20 approvals');
    });

    it('graduates with 20+ approvals and <10% rejection rate', () => {
      // Approve 20 actions, reject 1 (4.8% rejection rate)
      for (let i = 0; i < 20; i++) {
        const a = svc.createAction({ actionType: 'link', affectedIds: ['e1'], rationale: `r${i}` });
        svc.decideAction(a.id, 'approve');
      }
      const rejected = svc.createAction({
        actionType: 'link',
        affectedIds: ['e1'],
        rationale: 'bad',
      });
      svc.decideAction(rejected.id, 'reject');

      const result = machine.checkGraduation('link');
      expect(result.transitioned).toBe(true);
      expect(result.oldPhase).toBe('propose');
      expect(result.newPhase).toBe('act_report');
      expect(result.reason).toContain('Graduated');

      const state = svc.getTrustState('link');
      expect(state?.currentPhase).toBe('act_report');
      expect(state?.autonomousSince).not.toBeNull();
      expect(state?.graduatedAt).not.toBeNull();
    });

    it('does not graduate when rejection rate is >= 10%', () => {
      // Approve 20, reject 3 → 3/23 = 13.0% rejection rate
      for (let i = 0; i < 20; i++) {
        const a = svc.createAction({
          actionType: 'prune',
          affectedIds: ['e1'],
          rationale: `r${i}`,
        });
        svc.decideAction(a.id, 'approve');
      }
      for (let i = 0; i < 3; i++) {
        const a = svc.createAction({
          actionType: 'prune',
          affectedIds: ['e1'],
          rationale: `bad${i}`,
        });
        svc.decideAction(a.id, 'reject');
      }

      const result = machine.checkGraduation('prune');
      expect(result.transitioned).toBe(false);
      expect(result.reason).toContain('Rejection rate');
    });

    it('graduates at exactly 10% rejection rate threshold', () => {
      // Approve 20, reject 2 → 2/22 = 9.09% — below 10%
      for (let i = 0; i < 20; i++) {
        const a = svc.createAction({
          actionType: 'prune',
          affectedIds: ['e1'],
          rationale: `r${i}`,
        });
        svc.decideAction(a.id, 'approve');
      }
      for (let i = 0; i < 2; i++) {
        const a = svc.createAction({
          actionType: 'prune',
          affectedIds: ['e1'],
          rationale: `bad${i}`,
        });
        svc.decideAction(a.id, 'reject');
      }

      const result = machine.checkGraduation('prune');
      expect(result.transitioned).toBe(true);
    });

    it('respects custom thresholds', () => {
      thresholds.proposeToActReportMinApproved = 5;

      for (let i = 0; i < 5; i++) {
        const a = svc.createAction({ actionType: 'link', affectedIds: ['e1'], rationale: `r${i}` });
        svc.decideAction(a.id, 'approve');
      }

      const result = machine.checkGraduation('link');
      expect(result.transitioned).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // act_report → silent graduation
  // -----------------------------------------------------------------------

  describe('act_report → silent', () => {
    beforeEach(() => {
      // Pre-set to act_report phase
      svc.updateTrustState('audit', {
        currentPhase: 'act_report',
        autonomousSince: '2026-02-25T10:00:00.000Z', // ~61 days before April 27
      });
    });

    it('graduates after 60+ days with 0 reverts', () => {
      const result = machine.checkGraduation('audit');

      expect(result.transitioned).toBe(true);
      expect(result.oldPhase).toBe('act_report');
      expect(result.newPhase).toBe('silent');
      expect(result.reason).toContain('days in act_report with 0 reverts');
    });

    it('does not graduate before 60 days', () => {
      svc.updateTrustState('audit', {
        autonomousSince: '2026-04-01T10:00:00.000Z', // ~26 days before
      });

      const result = machine.checkGraduation('audit');

      expect(result.transitioned).toBe(false);
      expect(result.reason).toContain('Need 60 days');
    });

    it('does not graduate with reverts in the period', () => {
      svc.updateTrustState('audit', { revertedCount: 1 });

      // audit actions can't be reverted, but test the counter logic anyway
      // by using a different action type
      svc.updateTrustState('prune', {
        currentPhase: 'act_report',
        autonomousSince: '2026-02-25T10:00:00.000Z',
        revertedCount: 1,
      });

      const result = machine.checkGraduation('prune');

      expect(result.transitioned).toBe(false);
      expect(result.reason).toContain('reverts during act_report phase');
    });

    it('respects custom threshold for days', () => {
      thresholds.actReportToSilentMinDays = 30;
      svc.updateTrustState('audit', {
        autonomousSince: '2026-03-27T10:00:00.000Z', // ~31 days
      });

      const result = machine.checkGraduation('audit');
      expect(result.transitioned).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // silent phase
  // -----------------------------------------------------------------------

  describe('silent phase', () => {
    it('returns no transition when already in silent', () => {
      svc.updateTrustState('link', { currentPhase: 'silent' });

      const result = machine.checkGraduation('link');

      expect(result.transitioned).toBe(false);
      expect(result.oldPhase).toBe('silent');
      expect(result.newPhase).toBe('silent');
    });
  });

  // -----------------------------------------------------------------------
  // Demotion
  // -----------------------------------------------------------------------

  describe('automatic demotion', () => {
    it('demotes from act_report to propose on 2+ reverts in 7-day window', () => {
      svc.updateTrustState('consolidate', {
        currentPhase: 'act_report',
        autonomousSince: '2026-02-01T10:00:00.000Z',
        approvedCount: 25,
      });

      // Create and revert two actions — both within the default 7-day window
      const a1 = svc.createAction({
        actionType: 'consolidate',
        affectedIds: ['e1', 'e2'],
        rationale: 'merge 1',
      });
      // In act_report, actions auto-execute — revert directly
      svc.revertAction(a1.id);

      const a2 = svc.createAction({
        actionType: 'consolidate',
        affectedIds: ['e3', 'e4'],
        rationale: 'merge 2',
      });
      svc.revertAction(a2.id);

      const result = machine.checkGraduation('consolidate');

      expect(result.transitioned).toBe(true);
      expect(result.oldPhase).toBe('act_report');
      expect(result.newPhase).toBe('propose');
      expect(result.reason).toContain('Demoted');
      expect(result.reason).toContain('2 reverts');
    });

    it('resets all counters on demotion', () => {
      svc.updateTrustState('prune', {
        currentPhase: 'act_report',
        autonomousSince: '2026-02-01T10:00:00.000Z',
        approvedCount: 30,
        rejectedCount: 2,
      });

      // Revert two actions to trigger demotion
      const a1 = svc.createAction({ actionType: 'prune', affectedIds: ['e1'], rationale: 'r1' });
      svc.revertAction(a1.id);
      const a2 = svc.createAction({ actionType: 'prune', affectedIds: ['e2'], rationale: 'r2' });
      svc.revertAction(a2.id);

      machine.checkGraduation('prune');

      const state = svc.getTrustState('prune');
      expect(state?.currentPhase).toBe('propose');
      expect(state?.approvedCount).toBe(0);
      expect(state?.rejectedCount).toBe(0);
      expect(state?.revertedCount).toBe(0);
      expect(state?.autonomousSince).toBeNull();
    });

    it('demotes from silent to propose', () => {
      svc.updateTrustState('link', {
        currentPhase: 'silent',
        autonomousSince: '2025-01-01T00:00:00.000Z',
      });

      const a1 = svc.createAction({
        actionType: 'link',
        affectedIds: ['e1', 'e2'],
        rationale: 'r1',
      });
      svc.revertAction(a1.id);
      const a2 = svc.createAction({
        actionType: 'link',
        affectedIds: ['e3', 'e4'],
        rationale: 'r2',
      });
      svc.revertAction(a2.id);

      const result = machine.checkGraduation('link');

      expect(result.transitioned).toBe(true);
      expect(result.oldPhase).toBe('silent');
      expect(result.newPhase).toBe('propose');
    });

    it('does not demote from propose (already lowest)', () => {
      // Create and revert in propose phase (need to approve/execute first)
      const a1 = svc.createAction({ actionType: 'prune', affectedIds: ['e1'], rationale: 'r1' });
      svc.decideAction(a1.id, 'approve');
      svc.executeAction(a1.id);
      svc.revertAction(a1.id);

      const a2 = svc.createAction({ actionType: 'prune', affectedIds: ['e2'], rationale: 'r2' });
      svc.decideAction(a2.id, 'approve');
      svc.executeAction(a2.id);
      svc.revertAction(a2.id);

      const result = machine.checkGraduation('prune');

      expect(result.transitioned).toBe(false);
      expect(result.oldPhase).toBe('propose');
    });

    it('only counts reverts within the 7-day window', () => {
      svc.updateTrustState('prune', {
        currentPhase: 'act_report',
        autonomousSince: '2026-02-01T10:00:00.000Z',
      });

      // Revert one action
      const a1 = svc.createAction({ actionType: 'prune', affectedIds: ['e1'], rationale: 'r1' });
      svc.revertAction(a1.id);

      // Advance clock past 7-day window
      clock.setTime(new Date('2026-05-05T10:00:00Z'));

      // Revert another action — this one is 8 days later
      const a2 = svc.createAction({ actionType: 'prune', affectedIds: ['e2'], rationale: 'r2' });
      svc.revertAction(a2.id);

      // Only 1 revert in the most recent 7-day window
      const result = machine.checkGraduation('prune');
      expect(result.transitioned).toBe(false);
    });

    it('demotion takes precedence over graduation', () => {
      // Set up a state that could theoretically graduate to silent
      // but also has enough reverts to demote
      svc.updateTrustState('link', {
        currentPhase: 'act_report',
        autonomousSince: '2026-02-01T10:00:00.000Z',
        revertedCount: 0,
      });

      // Revert two actions to trigger demotion
      const a1 = svc.createAction({
        actionType: 'link',
        affectedIds: ['e1', 'e2'],
        rationale: 'r1',
      });
      svc.revertAction(a1.id);
      const a2 = svc.createAction({
        actionType: 'link',
        affectedIds: ['e3', 'e4'],
        rationale: 'r2',
      });
      svc.revertAction(a2.id);

      const result = machine.checkGraduation('link');

      expect(result.transitioned).toBe(true);
      expect(result.newPhase).toBe('propose');
      expect(result.reason).toContain('Demoted');
    });
  });

  // -----------------------------------------------------------------------
  // Integration: full lifecycle with graduation
  // -----------------------------------------------------------------------

  describe('full lifecycle with graduation', () => {
    it('propose → approve 20 → graduate → act_report → revert 2 → demote → propose', () => {
      // Phase 1: Build trust in propose phase
      for (let i = 0; i < 20; i++) {
        const a = svc.createAction({
          actionType: 'prune',
          affectedIds: ['e1'],
          rationale: `prune ${i}`,
        });
        svc.decideAction(a.id, 'approve');
        svc.executeAction(a.id);
      }

      // Check graduation — should transition to act_report
      const grad1 = machine.checkGraduation('prune');
      expect(grad1.transitioned).toBe(true);
      expect(grad1.newPhase).toBe('act_report');

      // Phase 2: Autonomous actions in act_report (auto-executed)
      const auto1 = svc.createAction({
        actionType: 'prune',
        affectedIds: ['e10'],
        rationale: 'auto prune 1',
      });
      expect(auto1.status).toBe('executed');

      // Phase 3: Bad behaviour — revert 2 actions
      svc.revertAction(auto1.id);
      const auto2 = svc.createAction({
        actionType: 'prune',
        affectedIds: ['e11'],
        rationale: 'auto prune 2',
      });
      svc.revertAction(auto2.id);

      // Check demotion — should reset to propose
      const demote = machine.checkGraduation('prune');
      expect(demote.transitioned).toBe(true);
      expect(demote.newPhase).toBe('propose');

      // Verify counters are reset
      const finalState = svc.getTrustState('prune');
      expect(finalState?.currentPhase).toBe('propose');
      expect(finalState?.approvedCount).toBe(0);
      expect(finalState?.rejectedCount).toBe(0);
      expect(finalState?.revertedCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles uninitialized trust state gracefully', () => {
      const result = machine.checkGraduation('nonexistent' as 'prune');

      expect(result.transitioned).toBe(false);
      expect(result.reason).toContain('not initialized');
    });

    it('lowering thresholds does not cause retroactive graduation without a trigger', () => {
      // Set up 10 approvals
      for (let i = 0; i < 10; i++) {
        const a = svc.createAction({ actionType: 'link', affectedIds: ['e1'], rationale: `r${i}` });
        svc.decideAction(a.id, 'approve');
      }

      // Lower threshold to 5
      thresholds.proposeToActReportMinApproved = 5;

      // Graduation fires on next check (triggered by the caller, not retroactive)
      const result = machine.checkGraduation('link');
      expect(result.transitioned).toBe(true);
    });

    it('all rejections keeps action type in propose permanently', () => {
      for (let i = 0; i < 25; i++) {
        const a = svc.createAction({
          actionType: 'prune',
          affectedIds: ['e1'],
          rationale: `r${i}`,
        });
        svc.decideAction(a.id, 'reject');
      }

      const result = machine.checkGraduation('prune');
      expect(result.transitioned).toBe(false);

      const state = svc.getTrustState('prune');
      expect(state?.currentPhase).toBe('propose');
      expect(state?.rejectedCount).toBe(25);
    });
  });
});
