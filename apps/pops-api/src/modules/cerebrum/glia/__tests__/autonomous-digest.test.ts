/**
 * Unit tests for the autonomous-action digest builder (#2577).
 *
 * Verifies grouping, ordering, anomaly detection, and renderer output
 * without touching the database — these are pure-function checks.
 */
import { describe, expect, it } from 'vitest';

import {
  buildAutonomousDigest,
  DEFAULT_REJECTION_RATE_ANOMALY_THRESHOLD,
  renderAutonomousDigestText,
} from '../digest-reports.js';

import type { GliaAction, GliaTrustState, ActionType, TrustPhase } from '../types.js';

function autonomousAction(overrides: Partial<GliaAction> = {}): GliaAction {
  return {
    id: 'glia_prune_20260510_a',
    actionType: 'prune',
    affectedIds: ['eng_1'],
    rationale: 'Stale engram archived',
    payload: null,
    phase: 'act_report',
    status: 'executed',
    userDecision: null,
    userNote: null,
    executedAt: '2026-05-10T10:00:00Z',
    decidedAt: null,
    revertedAt: null,
    createdAt: '2026-05-10T09:00:00Z',
    ...overrides,
  };
}

function trustState(
  actionType: ActionType,
  currentPhase: TrustPhase,
  overrides: Partial<GliaTrustState> = {}
): GliaTrustState {
  return {
    actionType,
    currentPhase,
    approvedCount: 0,
    rejectedCount: 0,
    revertedCount: 0,
    autonomousSince: currentPhase === 'propose' ? null : '2026-04-01T00:00:00Z',
    lastRevertAt: null,
    graduatedAt: currentPhase === 'propose' ? null : '2026-04-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

describe('buildAutonomousDigest', () => {
  it('groups actions by type and lists affected engrams with rationale', () => {
    const actions: GliaAction[] = [
      autonomousAction({
        id: 'a1',
        actionType: 'prune',
        affectedIds: ['eng_1'],
        rationale: 'Stale 1',
        executedAt: '2026-05-10T10:00:00Z',
      }),
      autonomousAction({
        id: 'a2',
        actionType: 'prune',
        affectedIds: ['eng_2'],
        rationale: 'Stale 2',
        executedAt: '2026-05-10T11:00:00Z',
      }),
      autonomousAction({
        id: 'a3',
        actionType: 'link',
        affectedIds: ['eng_3', 'eng_4'],
        rationale: 'Cross reference',
        executedAt: '2026-05-10T12:00:00Z',
      }),
    ];

    const report = buildAutonomousDigest({
      actions,
      trustStates: [trustState('prune', 'act_report'), trustState('link', 'act_report')],
      postGraduationExecutedByType: { prune: 2, link: 1 },
      postGraduationRevertedByType: { prune: 0, link: 0 },
      period: 'daily',
      startDate: '2026-05-10T00:00:00Z',
      endDate: '2026-05-11T00:00:00Z',
    });

    expect(report.totalAutonomousActions).toBe(3);
    expect(report.groups).toHaveLength(2);

    // Highest-volume group first; ties broken alphabetically.
    expect(report.groups[0]?.actionType).toBe('prune');
    expect(report.groups[0]?.count).toBe(2);
    expect(report.groups[0]?.actions.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(report.groups[0]?.actions[0]?.affectedIds).toEqual(['eng_1']);
    expect(report.groups[0]?.actions[0]?.rationale).toBe('Stale 1');

    expect(report.groups[1]?.actionType).toBe('link');
    expect(report.groups[1]?.count).toBe(1);
    expect(report.groups[1]?.actions[0]?.affectedIds).toEqual(['eng_3', 'eng_4']);
  });

  it('sorts entries inside a group chronologically', () => {
    const actions: GliaAction[] = [
      autonomousAction({ id: 'late', executedAt: '2026-05-10T12:00:00Z' }),
      autonomousAction({ id: 'early', executedAt: '2026-05-10T08:00:00Z' }),
      autonomousAction({ id: 'mid', executedAt: '2026-05-10T10:00:00Z' }),
    ];

    const report = buildAutonomousDigest({
      actions,
      trustStates: [trustState('prune', 'act_report')],
      postGraduationExecutedByType: { prune: 3 },
      postGraduationRevertedByType: { prune: 0 },
      period: 'daily',
      startDate: '2026-05-10T00:00:00Z',
      endDate: '2026-05-11T00:00:00Z',
    });

    expect(report.groups[0]?.actions.map((a) => a.id)).toEqual(['early', 'mid', 'late']);
  });

  it('skips rows that are not actually autonomous', () => {
    const actions: GliaAction[] = [
      autonomousAction({ id: 'autonomous' }),
      // decidedAt populated → user-driven, must be filtered out defensively.
      autonomousAction({ id: 'user-driven', decidedAt: '2026-05-10T09:30:00Z' }),
      // status != executed → not a completed autonomous action.
      autonomousAction({ id: 'pending', status: 'pending', executedAt: null }),
    ];

    const report = buildAutonomousDigest({
      actions,
      trustStates: [trustState('prune', 'act_report')],
      postGraduationExecutedByType: { prune: 1 },
      postGraduationRevertedByType: { prune: 0 },
      period: 'daily',
      startDate: '2026-05-10T00:00:00Z',
      endDate: '2026-05-11T00:00:00Z',
    });

    expect(report.groups[0]?.actions.map((a) => a.id)).toEqual(['autonomous']);
  });

  it('returns an empty report when there are no actions', () => {
    const report = buildAutonomousDigest({
      actions: [],
      trustStates: [trustState('prune', 'act_report')],
      postGraduationExecutedByType: {},
      postGraduationRevertedByType: {},
      period: 'daily',
      startDate: '2026-05-10T00:00:00Z',
      endDate: '2026-05-11T00:00:00Z',
    });

    expect(report.totalAutonomousActions).toBe(0);
    expect(report.groups).toEqual([]);
    expect(report.anomalies).toEqual([]);
  });
});

describe('buildAutonomousDigest anomalies', () => {
  it('flags an action type whose post-graduation rejection rate exceeds the default threshold', () => {
    // 4 reverted / 10 total = 40% — above the 30% default.
    const report = buildAutonomousDigest({
      actions: [autonomousAction()],
      trustStates: [trustState('prune', 'act_report')],
      postGraduationExecutedByType: { prune: 6 },
      postGraduationRevertedByType: { prune: 4 },
      period: 'weekly',
      startDate: '2026-05-04T00:00:00Z',
      endDate: '2026-05-11T00:00:00Z',
    });

    expect(report.anomalies).toHaveLength(1);
    const anomaly = report.anomalies[0];
    expect(anomaly?.actionType).toBe('prune');
    expect(anomaly?.rejectionRatePostGraduation).toBeCloseTo(0.4);
    expect(anomaly?.threshold).toBe(DEFAULT_REJECTION_RATE_ANOMALY_THRESHOLD);
    expect(anomaly?.executedCount).toBe(6);
    expect(anomaly?.revertedCount).toBe(4);
  });

  it('does not flag types in propose phase', () => {
    const report = buildAutonomousDigest({
      actions: [],
      trustStates: [trustState('prune', 'propose', { autonomousSince: null })],
      postGraduationExecutedByType: { prune: 1 },
      postGraduationRevertedByType: { prune: 10 },
      period: 'daily',
      startDate: '2026-05-10T00:00:00Z',
      endDate: '2026-05-11T00:00:00Z',
    });
    expect(report.anomalies).toEqual([]);
  });

  it('respects a custom threshold', () => {
    const report = buildAutonomousDigest({
      actions: [],
      trustStates: [trustState('prune', 'act_report')],
      postGraduationExecutedByType: { prune: 8 },
      // 2/10 = 20% — above a 15% threshold, below the 30% default.
      postGraduationRevertedByType: { prune: 2 },
      period: 'daily',
      startDate: '2026-05-10T00:00:00Z',
      endDate: '2026-05-11T00:00:00Z',
      rejectionRateThreshold: 0.15,
    });

    expect(report.anomalies).toHaveLength(1);
    expect(report.anomalies[0]?.rejectionRatePostGraduation).toBeCloseTo(0.2);
    expect(report.anomalies[0]?.threshold).toBe(0.15);
  });

  it('does not flag when total post-graduation activity is zero', () => {
    const report = buildAutonomousDigest({
      actions: [],
      trustStates: [trustState('link', 'act_report')],
      postGraduationExecutedByType: { link: 0 },
      postGraduationRevertedByType: { link: 0 },
      period: 'daily',
      startDate: '2026-05-10T00:00:00Z',
      endDate: '2026-05-11T00:00:00Z',
    });
    expect(report.anomalies).toEqual([]);
  });
});

describe('renderAutonomousDigestText', () => {
  it('renders groups, affected engrams, and anomalies in plain text', () => {
    const report = buildAutonomousDigest({
      actions: [
        autonomousAction({
          id: 'a1',
          actionType: 'prune',
          affectedIds: ['eng_1'],
          rationale: 'Stale',
        }),
        autonomousAction({
          id: 'a2',
          actionType: 'link',
          affectedIds: ['eng_a', 'eng_b'],
          rationale: 'Linked',
        }),
      ],
      trustStates: [trustState('prune', 'act_report'), trustState('link', 'act_report')],
      postGraduationExecutedByType: { prune: 1, link: 6 },
      postGraduationRevertedByType: { prune: 0, link: 4 },
      period: 'daily',
      startDate: '2026-05-10T00:00:00Z',
      endDate: '2026-05-11T00:00:00Z',
    });

    const text = renderAutonomousDigestText(report);
    expect(text).toContain('Daily Glia digest — 2 autonomous actions');
    expect(text).toContain('prune (1)');
    expect(text).toContain('link (1)');
    expect(text).toContain('[eng_1] Stale');
    expect(text).toContain('[eng_a, eng_b] Linked');
    expect(text).toContain('Anomalies');
    expect(text).toContain('link: 40.0% post-graduation rejection rate (4/10)');
  });

  it('truncates per-group previews above 5 entries', () => {
    const actions: GliaAction[] = Array.from({ length: 7 }, (_, i) =>
      autonomousAction({
        id: `a${i}`,
        executedAt: `2026-05-10T10:0${i}:00Z`,
      })
    );
    const report = buildAutonomousDigest({
      actions,
      trustStates: [trustState('prune', 'act_report')],
      postGraduationExecutedByType: { prune: 7 },
      postGraduationRevertedByType: { prune: 0 },
      period: 'daily',
      startDate: '2026-05-10T00:00:00Z',
      endDate: '2026-05-11T00:00:00Z',
    });

    const text = renderAutonomousDigestText(report);
    expect(text).toContain('+2 more');
  });
});
