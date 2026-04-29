/**
 * Tests for digest reports (#2248).
 */
import { describe, expect, it } from 'vitest';

import { buildDigestReport, dailyDigestRange, weeklyDigestRange } from '../digest-reports.js';

import type { GliaAction } from '../types.js';

function makeAction(overrides: Partial<GliaAction> = {}): GliaAction {
  return {
    id: 'glia_prune_20260427_abc',
    actionType: 'prune',
    affectedIds: ['eng_1'],
    rationale: 'Stale engram archived',
    payload: null,
    phase: 'act_report',
    status: 'executed',
    userDecision: null,
    userNote: null,
    executedAt: '2026-04-27T10:00:00Z',
    decidedAt: null,
    revertedAt: null,
    createdAt: '2026-04-27T09:00:00Z',
    ...overrides,
  };
}

describe('buildDigestReport', () => {
  it('computes correct summary for a set of actions', () => {
    const actions: GliaAction[] = [
      makeAction({ actionType: 'prune', status: 'executed' }),
      makeAction({ actionType: 'prune', status: 'executed' }),
      makeAction({ actionType: 'consolidate', status: 'approved' }),
      makeAction({ actionType: 'link', status: 'rejected' }),
      makeAction({ actionType: 'prune', status: 'reverted' }),
    ];

    const report = buildDigestReport(
      actions,
      'daily',
      '2026-04-26T00:00:00Z',
      '2026-04-27T00:00:00Z'
    );

    expect(report.period).toBe('daily');
    expect(report.summary.totalActions).toBe(5);
    expect(report.summary.byType.prune.total).toBe(3);
    expect(report.summary.byType.prune.executed).toBe(2);
    expect(report.summary.byType.prune.reverted).toBe(1);
    expect(report.summary.byType.consolidate.approved).toBe(1);
    expect(report.summary.byType.link.rejected).toBe(1);
    expect(report.summary.revertCount).toBe(1);
  });

  it('computes approval rate correctly', () => {
    const actions: GliaAction[] = [
      makeAction({ status: 'approved' }),
      makeAction({ status: 'approved' }),
      makeAction({ status: 'rejected' }),
      makeAction({ status: 'executed' }),
    ];

    const report = buildDigestReport(
      actions,
      'weekly',
      '2026-04-20T00:00:00Z',
      '2026-04-27T00:00:00Z'
    );

    // approved (2) + executed (1) = 3 approved out of 4 decided
    expect(report.summary.approvalRate).toBe(0.75);
  });

  it('generates highlights for empty periods', () => {
    const report = buildDigestReport([], 'daily', '2026-04-26T00:00:00Z', '2026-04-27T00:00:00Z');

    expect(report.highlights).toContain('No glia activity in this period.');
  });

  it('highlights reverts', () => {
    const actions: GliaAction[] = [
      makeAction({ status: 'reverted', rationale: 'Bad prune of important engram' }),
    ];

    const report = buildDigestReport(
      actions,
      'daily',
      '2026-04-26T00:00:00Z',
      '2026-04-27T00:00:00Z'
    );

    const revertHighlight = report.highlights.find((h) => h.includes('Reverted'));
    expect(revertHighlight).toBeDefined();
    expect(revertHighlight).toContain('Bad prune');
  });

  it('highlights low approval rate', () => {
    const actions: GliaAction[] = Array.from({ length: 8 }, (_, i) =>
      makeAction({ status: i < 3 ? 'approved' : 'rejected' })
    );

    const report = buildDigestReport(
      actions,
      'weekly',
      '2026-04-20T00:00:00Z',
      '2026-04-27T00:00:00Z'
    );

    const lowRate = report.highlights.find((h) => h.includes('Low approval rate'));
    expect(lowRate).toBeDefined();
  });
});

describe('dailyDigestRange', () => {
  it('returns a 1-day range ending at midnight local time', () => {
    const now = new Date('2026-04-27T15:30:00Z');
    const { startDate, endDate } = dailyDigestRange(now);

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    const diffDays = diffMs / (24 * 60 * 60 * 1000);

    expect(diffDays).toBe(1);
    // End should be at midnight of the same day as 'now' (local time)
    expect(end.getHours()).toBe(0);
    expect(end.getMinutes()).toBe(0);
  });
});

describe('weeklyDigestRange', () => {
  it('returns 7-day range', () => {
    const now = new Date('2026-04-27T15:30:00Z');
    const { startDate, endDate } = weeklyDigestRange(now);

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);

    expect(diffDays).toBe(7);
  });
});
