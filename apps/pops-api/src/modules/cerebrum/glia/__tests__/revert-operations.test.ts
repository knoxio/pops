/**
 * Tests for revert operations (#2248).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { executeRevert } from '../revert-operations.js';

import type { GliaAction } from '../types.js';

function makeAction(overrides: Partial<GliaAction> = {}): GliaAction {
  return {
    id: 'glia_prune_20260427_abc123',
    actionType: 'prune',
    affectedIds: ['eng_1', 'eng_2'],
    rationale: 'Stale engrams archived',
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

function mockEngramService() {
  return {
    update: vi.fn(),
    unlink: vi.fn(),
  };
}

describe('executeRevert', () => {
  describe('prune revert', () => {
    it('restores all affected engrams to active status', () => {
      const svc = mockEngramService();
      const action = makeAction({ actionType: 'prune', affectedIds: ['eng_1', 'eng_2'] });

      const result = executeRevert(action, svc as never);

      expect(svc.update).toHaveBeenCalledWith('eng_1', { status: 'active' });
      expect(svc.update).toHaveBeenCalledWith('eng_2', { status: 'active' });
      expect(result.success).toBe(true);
      expect(result.restoredIds).toEqual(['eng_1', 'eng_2']);
    });

    it('reports partial failure when some restores fail', () => {
      const svc = mockEngramService();
      svc.update.mockImplementation((id: string) => {
        if (id === 'eng_2') throw new Error('Not found');
      });

      const action = makeAction({ actionType: 'prune', affectedIds: ['eng_1', 'eng_2'] });
      const result = executeRevert(action, svc as never);

      expect(result.success).toBe(false);
      expect(result.restoredIds).toEqual(['eng_1']);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('eng_2');
    });
  });

  describe('consolidate revert', () => {
    it('restores consolidated engrams to active', () => {
      const svc = mockEngramService();
      const action = makeAction({
        actionType: 'consolidate',
        affectedIds: ['eng_a', 'eng_b', 'eng_c'],
      });

      const result = executeRevert(action, svc as never);

      expect(svc.update).toHaveBeenCalledTimes(3);
      expect(result.restoredIds).toEqual(['eng_a', 'eng_b', 'eng_c']);
      expect(result.success).toBe(true);
    });
  });

  describe('link revert', () => {
    it('unlinks using payload sourceId/targetId', () => {
      const svc = mockEngramService();
      const action = makeAction({
        actionType: 'link',
        affectedIds: ['eng_src', 'eng_tgt'],
        payload: { sourceId: 'eng_src', targetId: 'eng_tgt' },
      });

      const result = executeRevert(action, svc as never);

      expect(svc.unlink).toHaveBeenCalledWith('eng_src', 'eng_tgt');
      expect(result.success).toBe(true);
    });

    it('falls back to first two affectedIds when payload lacks IDs', () => {
      const svc = mockEngramService();
      const action = makeAction({
        actionType: 'link',
        affectedIds: ['eng_x', 'eng_y'],
        payload: null,
      });

      const result = executeRevert(action, svc as never);

      expect(svc.unlink).toHaveBeenCalledWith('eng_x', 'eng_y');
      expect(result.success).toBe(true);
    });
  });

  describe('audit revert', () => {
    it('is a no-op (audit actions are informational)', () => {
      const svc = mockEngramService();
      const action = makeAction({ actionType: 'audit' });

      const result = executeRevert(action, svc as never);

      expect(svc.update).not.toHaveBeenCalled();
      expect(svc.unlink).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });
});
