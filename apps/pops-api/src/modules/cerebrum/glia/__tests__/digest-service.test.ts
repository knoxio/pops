/**
 * Integration tests for GliaDigestService (#2577).
 *
 * Exercises the full pipeline against an in-memory DB: autonomous-action
 * query → grouping → anomaly detection → channel delivery (mocked).
 *
 * Covers PRD-086 US-04 AC #5/#6:
 *   - Grouping by action type with affected engrams + rationale
 *   - Anomaly tripping on high post-graduation rejection rate
 *   - Silent-phase suppression
 *   - Empty-period happy path (no delivery attempted)
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDb } from '../../../../shared/test-utils.js';
import { GliaActionService } from '../action-service.js';
import { GliaDigestService } from '../digest-service.js';

import type { Database } from 'better-sqlite3';

import type { DigestDeliveryChannels } from '../digest-service.js';
import type { ActionType } from '../types.js';

function fixedClock(iso: string): () => Date {
  return () => new Date(iso);
}

function steppingClock(iso: string, stepMs = 1_000): () => Date {
  let t = new Date(iso).getTime();
  return () => {
    const d = new Date(t);
    t += stepMs;
    return d;
  };
}

function makeChannels(): {
  channels: DigestDeliveryChannels;
  shell: ReturnType<typeof vi.fn>;
  moltbot: ReturnType<typeof vi.fn>;
} {
  const shell = vi.fn().mockReturnValue(true);
  const moltbot = vi.fn().mockResolvedValue(true);
  return {
    channels: { shell, moltbot },
    shell,
    moltbot,
  };
}

function seedAutonomous(
  svc: GliaActionService,
  actionType: ActionType,
  options: { affectedIds?: string[]; rationale?: string } = {}
): { id: string } {
  svc.updateTrustState(actionType, {
    currentPhase: 'act_report',
    autonomousSince: '2026-04-01T00:00:00Z',
    graduatedAt: '2026-04-01T00:00:00Z',
  });
  const action = svc.createAction({
    actionType,
    affectedIds: options.affectedIds ?? ['eng_default'],
    rationale: options.rationale ?? 'Autonomous rationale',
  });
  return { id: action.id };
}

describe('GliaDigestService', () => {
  let db: Database;
  let actionService: GliaActionService;

  beforeEach(() => {
    db = createTestDb();
    actionService = new GliaActionService(
      drizzle<Record<string, unknown>>(db),
      steppingClock('2026-05-10T10:00:00Z', 60_000)
    );
    actionService.seedTrustStates();
  });

  afterEach(() => {
    db.close();
  });

  it('builds a digest grouped by action type with affected engrams and rationale', async () => {
    seedAutonomous(actionService, 'prune', {
      affectedIds: ['eng_1'],
      rationale: 'Stale engram 1',
    });
    seedAutonomous(actionService, 'prune', {
      affectedIds: ['eng_2'],
      rationale: 'Stale engram 2',
    });
    seedAutonomous(actionService, 'link', {
      affectedIds: ['eng_3', 'eng_4'],
      rationale: 'Linked',
    });

    const { channels, shell, moltbot } = makeChannels();
    const digest = new GliaDigestService(actionService, {
      now: fixedClock('2026-05-11T01:00:00Z'),
      channels,
    });

    const result = await digest.generate({ period: 'daily' });

    expect(result.report.totalAutonomousActions).toBe(3);
    expect(result.report.groups.map((g) => g.actionType)).toEqual(['prune', 'link']);
    expect(result.report.groups[0]?.actions.map((a) => a.rationale)).toEqual([
      'Stale engram 1',
      'Stale engram 2',
    ]);
    expect(result.report.groups[1]?.actions[0]?.affectedIds).toEqual(['eng_3', 'eng_4']);

    expect(result.delivery.attempted).toBe(true);
    expect(shell).toHaveBeenCalledOnce();
    expect(moltbot).toHaveBeenCalledOnce();
  });

  it('flags an anomaly when post-graduation rejection rate exceeds the threshold', async () => {
    actionService.updateTrustState('prune', {
      currentPhase: 'act_report',
      autonomousSince: '2026-04-01T00:00:00Z',
    });
    const seeded: string[] = [];
    for (let i = 0; i < 10; i++) {
      seeded.push(
        actionService.createAction({
          actionType: 'prune',
          affectedIds: [`eng_${i}`],
          rationale: `Autonomous ${i}`,
        }).id
      );
    }
    for (let i = 0; i < 4; i++) {
      const id = seeded[i];
      if (id) actionService.revertAction(id);
    }

    const { channels } = makeChannels();
    const digest = new GliaDigestService(actionService, {
      now: fixedClock('2026-05-11T01:00:00Z'),
      channels,
    });

    const result = await digest.generate({ period: 'weekly' });
    expect(result.report.anomalies).toHaveLength(1);
    const anomaly = result.report.anomalies[0];
    expect(anomaly?.actionType).toBe('prune');
    expect(anomaly?.rejectionRatePostGraduation).toBeCloseTo(0.4);
  });

  it('respects a custom rejection-rate threshold', async () => {
    actionService.updateTrustState('link', {
      currentPhase: 'act_report',
      autonomousSince: '2026-04-01T00:00:00Z',
    });
    const seeded: string[] = [];
    for (let i = 0; i < 10; i++) {
      seeded.push(
        actionService.createAction({
          actionType: 'link',
          affectedIds: [`eng_${i}`],
          rationale: 'Link',
        }).id
      );
    }
    const r0 = seeded[0];
    const r1 = seeded[1];
    if (r0) actionService.revertAction(r0);
    if (r1) actionService.revertAction(r1);

    const { channels } = makeChannels();
    const digest = new GliaDigestService(actionService, {
      now: fixedClock('2026-05-11T01:00:00Z'),
      channels,
    });

    const defaultResult = await digest.generate({
      period: 'weekly',
      deliver: false,
    });
    expect(defaultResult.report.anomalies).toEqual([]);

    const tightResult = await digest.generate({
      period: 'weekly',
      rejectionRateThreshold: 0.15,
      deliver: false,
    });
    expect(tightResult.report.anomalies).toHaveLength(1);
  });

  it('suppresses delivery when all action types in the digest are in silent phase', async () => {
    seedAutonomous(actionService, 'audit', { rationale: 'Quiet audit' });
    actionService.updateTrustState('audit', {
      currentPhase: 'silent',
      autonomousSince: '2026-04-01T00:00:00Z',
    });

    const { channels, shell, moltbot } = makeChannels();
    const digest = new GliaDigestService(actionService, {
      now: fixedClock('2026-05-11T01:00:00Z'),
      channels,
    });

    const result = await digest.generate({ period: 'daily' });
    expect(result.report.totalAutonomousActions).toBe(1);
    expect(result.delivery.attempted).toBe(false);
    expect(result.delivery.suppressedReason).toMatch(/silent phase/);
    expect(shell).not.toHaveBeenCalled();
    expect(moltbot).not.toHaveBeenCalled();
  });

  it('still delivers when at least one action type in the digest is in act_report', async () => {
    seedAutonomous(actionService, 'link', { rationale: 'Linked' });
    seedAutonomous(actionService, 'audit', { rationale: 'Audited' });
    actionService.updateTrustState('audit', {
      currentPhase: 'silent',
      autonomousSince: '2026-04-01T00:00:00Z',
    });

    const { channels, shell, moltbot } = makeChannels();
    const digest = new GliaDigestService(actionService, {
      now: fixedClock('2026-05-11T01:00:00Z'),
      channels,
    });

    const result = await digest.generate({ period: 'daily' });
    expect(result.delivery.attempted).toBe(true);
    expect(shell).toHaveBeenCalledOnce();
    expect(moltbot).toHaveBeenCalledOnce();
  });

  it('does not attempt delivery for an empty period (no autonomous actions)', async () => {
    const { channels, shell, moltbot } = makeChannels();
    const digest = new GliaDigestService(actionService, {
      now: fixedClock('2026-05-11T01:00:00Z'),
      channels,
    });

    const result = await digest.generate({ period: 'daily' });
    expect(result.report.totalAutonomousActions).toBe(0);
    expect(result.report.groups).toEqual([]);
    expect(result.delivery.attempted).toBe(false);
    expect(result.delivery.suppressedReason).toMatch(/No autonomous actions/);
    expect(shell).not.toHaveBeenCalled();
    expect(moltbot).not.toHaveBeenCalled();
  });

  it('filters to a single action type when requested', async () => {
    seedAutonomous(actionService, 'prune', { rationale: 'P' });
    seedAutonomous(actionService, 'link', { rationale: 'L' });

    const { channels } = makeChannels();
    const digest = new GliaDigestService(actionService, {
      now: fixedClock('2026-05-11T01:00:00Z'),
      channels,
    });

    const result = await digest.generate({ period: 'daily', actionType: 'prune' });
    expect(result.report.totalAutonomousActions).toBe(1);
    expect(result.report.groups.map((g) => g.actionType)).toEqual(['prune']);
  });

  it('skips delivery when caller passes deliver=false', async () => {
    seedAutonomous(actionService, 'prune', { rationale: 'P' });
    const { channels, shell, moltbot } = makeChannels();
    const digest = new GliaDigestService(actionService, {
      now: fixedClock('2026-05-11T01:00:00Z'),
      channels,
    });

    const result = await digest.generate({ period: 'daily', deliver: false });
    expect(result.report.totalAutonomousActions).toBe(1);
    expect(result.delivery.attempted).toBe(false);
    expect(shell).not.toHaveBeenCalled();
    expect(moltbot).not.toHaveBeenCalled();
  });

  it('records per-channel failures without throwing', async () => {
    seedAutonomous(actionService, 'prune', { rationale: 'P' });
    const channels: DigestDeliveryChannels = {
      shell: vi.fn().mockImplementation(() => {
        throw new Error('shell down');
      }),
      moltbot: vi.fn().mockResolvedValue(true),
    };
    const digest = new GliaDigestService(actionService, {
      now: fixedClock('2026-05-11T01:00:00Z'),
      channels,
    });

    const result = await digest.generate({ period: 'daily' });
    expect(result.delivery.attempted).toBe(true);

    const shellResult = result.delivery.channels.find((c) => c.channel === 'shell');
    expect(shellResult?.delivered).toBe(false);
    expect(shellResult?.reason).toBe('shell down');

    const moltbotResult = result.delivery.channels.find((c) => c.channel === 'moltbot');
    expect(moltbotResult?.delivered).toBe(true);
  });
});
