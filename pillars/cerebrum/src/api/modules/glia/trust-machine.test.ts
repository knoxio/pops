/**
 * GliaTrustMachine unit tests.
 *
 * Graduation thresholds, demotion logic, counter resets, and phase-transition
 * edge cases. Runs against a real temp `cerebrum.db` so the transactional
 * decide/revert counter writes are exercised end to end, with a controllable
 * clock for the time-window logic.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../../db/index.js';
import { GliaActionService } from './action-service.js';
import { FALLBACK_THRESHOLDS } from './thresholds.js';
import { GliaTrustMachine } from './trust-machine.js';

import type { GraduationThresholds } from './types.js';

/** Fixed clock that advances one second per call. */
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
  let tmpDir: string;
  let opened: OpenedCerebrumDb;
  let svc: GliaActionService;
  let machine: GliaTrustMachine;
  let clock: ReturnType<typeof makeControllableClock>;
  let thresholds: GraduationThresholds;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-glia-trust-'));
    opened = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
    clock = makeControllableClock();
    thresholds = { ...FALLBACK_THRESHOLDS };
    svc = new GliaActionService(opened.db, clock.now);
    machine = new GliaTrustMachine(svc, () => thresholds, clock.now);
    svc.seedTrustStates();
  });

  afterEach(() => {
    opened.raw.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('propose → act_report', () => {
    it('does not graduate with fewer than 20 approvals', () => {
      for (let i = 0; i < 19; i++) {
        const a = svc.createAction({ actionType: 'link', affectedIds: ['e1'], rationale: `r${i}` });
        svc.decideAction(a.id, 'approve');
      }

      const result = machine.checkGraduation('link');
      expect(result.transitioned).toBe(false);
      expect(result.reason).toContain('Need 20 approvals');
    });

    it('graduates with 20+ approvals and <10% rejection rate', () => {
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

    it('graduates at exactly the 10% rejection-rate threshold', () => {
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

  describe('act_report → silent', () => {
    beforeEach(() => {
      svc.updateTrustState('audit', {
        currentPhase: 'act_report',
        autonomousSince: '2026-02-25T10:00:00.000Z',
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
      svc.updateTrustState('audit', { autonomousSince: '2026-04-01T10:00:00.000Z' });

      const result = machine.checkGraduation('audit');

      expect(result.transitioned).toBe(false);
      expect(result.reason).toContain('Need 60 days');
    });

    it('does not graduate with reverts in the period', () => {
      svc.updateTrustState('prune', {
        currentPhase: 'act_report',
        autonomousSince: '2026-02-25T10:00:00.000Z',
        revertedCount: 1,
      });

      const result = machine.checkGraduation('prune');

      expect(result.transitioned).toBe(false);
      expect(result.reason).toContain('reverts during act_report phase');
    });

    it('respects a custom day threshold', () => {
      thresholds.actReportToSilentMinDays = 30;
      svc.updateTrustState('audit', { autonomousSince: '2026-03-27T10:00:00.000Z' });

      const result = machine.checkGraduation('audit');
      expect(result.transitioned).toBe(true);
    });
  });

  describe('silent phase', () => {
    it('returns no transition when already in silent', () => {
      svc.updateTrustState('link', { currentPhase: 'silent' });

      const result = machine.checkGraduation('link');

      expect(result.transitioned).toBe(false);
      expect(result.oldPhase).toBe('silent');
      expect(result.newPhase).toBe('silent');
    });
  });

  describe('automatic demotion', () => {
    it('demotes from act_report to propose on 2+ reverts in the window', () => {
      svc.updateTrustState('consolidate', {
        currentPhase: 'act_report',
        autonomousSince: '2026-02-01T10:00:00.000Z',
        approvedCount: 25,
      });

      const a1 = svc.createAction({
        actionType: 'consolidate',
        affectedIds: ['e1', 'e2'],
        rationale: 'merge 1',
      });
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

    it('only counts reverts within the rolling window', () => {
      svc.updateTrustState('prune', {
        currentPhase: 'act_report',
        autonomousSince: '2026-02-01T10:00:00.000Z',
      });

      const a1 = svc.createAction({ actionType: 'prune', affectedIds: ['e1'], rationale: 'r1' });
      svc.revertAction(a1.id);

      clock.setTime(new Date('2026-05-05T10:00:00Z'));

      const a2 = svc.createAction({ actionType: 'prune', affectedIds: ['e2'], rationale: 'r2' });
      svc.revertAction(a2.id);

      const result = machine.checkGraduation('prune');
      expect(result.transitioned).toBe(false);
    });

    it('demotion takes precedence over graduation', () => {
      svc.updateTrustState('link', {
        currentPhase: 'act_report',
        autonomousSince: '2026-02-01T10:00:00.000Z',
        revertedCount: 0,
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
      expect(result.newPhase).toBe('propose');
      expect(result.reason).toContain('Demoted');
    });
  });

  describe('full lifecycle with graduation', () => {
    it('propose → approve 20 → graduate → act_report → revert 2 → demote → propose', () => {
      for (let i = 0; i < 20; i++) {
        const a = svc.createAction({
          actionType: 'prune',
          affectedIds: ['e1'],
          rationale: `prune ${i}`,
        });
        svc.decideAction(a.id, 'approve');
        svc.executeAction(a.id);
      }

      const grad1 = machine.checkGraduation('prune');
      expect(grad1.transitioned).toBe(true);
      expect(grad1.newPhase).toBe('act_report');

      const auto1 = svc.createAction({
        actionType: 'prune',
        affectedIds: ['e10'],
        rationale: 'auto prune 1',
      });
      expect(auto1.status).toBe('executed');

      svc.revertAction(auto1.id);
      const auto2 = svc.createAction({
        actionType: 'prune',
        affectedIds: ['e11'],
        rationale: 'auto prune 2',
      });
      svc.revertAction(auto2.id);

      const demote = machine.checkGraduation('prune');
      expect(demote.transitioned).toBe(true);
      expect(demote.newPhase).toBe('propose');

      const finalState = svc.getTrustState('prune');
      expect(finalState?.currentPhase).toBe('propose');
      expect(finalState?.approvedCount).toBe(0);
      expect(finalState?.rejectedCount).toBe(0);
      expect(finalState?.revertedCount).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles uninitialized trust state gracefully', () => {
      opened.raw.prepare("DELETE FROM glia_trust_state WHERE action_type = 'prune'").run();

      const result = machine.checkGraduation('prune');

      expect(result.transitioned).toBe(false);
      expect(result.reason).toContain('not initialized');
    });

    it('graduation fires on the next check after lowering thresholds, not retroactively', () => {
      for (let i = 0; i < 10; i++) {
        const a = svc.createAction({ actionType: 'link', affectedIds: ['e1'], rationale: `r${i}` });
        svc.decideAction(a.id, 'approve');
      }

      thresholds.proposeToActReportMinApproved = 5;

      const result = machine.checkGraduation('link');
      expect(result.transitioned).toBe(true);
    });

    it('all rejections keeps an action type in propose permanently', () => {
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
