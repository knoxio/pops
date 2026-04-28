/**
 * Tests for PrunerWorker (US-01, PRD-085).
 *
 * Covers: staleness scoring, threshold filtering, orphan detection,
 * secret scope skipping, trust phase behaviour, and rationale generation.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { PrunerWorker } from '../pruner.js';
import { makeEngram, mockEngramService, mockSearchService, TEST_NOW } from './fixtures.js';

import type { EngramService } from '../../engrams/service.js';
import type { Engram } from '../../engrams/types.js';
import type { HybridSearchService } from '../../retrieval/hybrid-search.js';
import type { PrunerDeps } from '../pruner.js';
import type { TrustPhase } from '../types.js';

function makeDeps(overrides: Partial<PrunerDeps> = {}): PrunerDeps {
  return {
    engramService: mockEngramService() as unknown as EngramService,
    searchService: mockSearchService() as unknown as HybridSearchService,
    now: () => TEST_NOW,
    ...overrides,
  };
}

describe('PrunerWorker', () => {
  describe('staleness scoring', () => {
    it('returns 0 for a freshly modified engram with max links and max hits', () => {
      const deps = makeDeps({
        getInboundLinkCount: () => 20, // at or above MAX_LINK_COUNT
        getQueryHitCount: () => 50, // at or above MAX_HIT_COUNT
        getLastQueriedAt: () => TEST_NOW,
      });
      const worker = new PrunerWorker(deps);
      const engram = makeEngram({ modified: TEST_NOW.toISOString() });

      const result = worker.computeStaleness(engram, []);
      expect(result.score).toBe(0);
    });

    it('returns 1 for an engram untouched for 365+ days with no links or hits', () => {
      const deps = makeDeps({
        getInboundLinkCount: () => 0,
        getQueryHitCount: () => 0,
      });
      const worker = new PrunerWorker(deps);
      const staleDate = new Date(TEST_NOW);
      staleDate.setFullYear(staleDate.getFullYear() - 2);
      const engram = makeEngram({ modified: staleDate.toISOString() });

      const result = worker.computeStaleness(engram, []);
      expect(result.score).toBe(1);
    });

    it('weights days-since-modified at 0.3', () => {
      const deps = makeDeps({
        getInboundLinkCount: () => 20, // maxed out, contributes 0
        getQueryHitCount: () => 50, // maxed out, contributes 0
        getLastQueriedAt: () => TEST_NOW, // contributes 0 days
      });
      const worker = new PrunerWorker(deps);
      const halfwayDate = new Date(TEST_NOW);
      halfwayDate.setDate(halfwayDate.getDate() - 183); // ~half of 365
      const engram = makeEngram({ modified: halfwayDate.toISOString() });

      const result = worker.computeStaleness(engram, []);
      // Should be approximately 0.3 * (183/365) ≈ 0.15
      expect(result.score).toBeCloseTo(0.15, 1);
    });

    it('resets query hit staleness if queried within 7 days', () => {
      const recentQuery = new Date(TEST_NOW);
      recentQuery.setDate(recentQuery.getDate() - 3);
      const deps = makeDeps({
        getInboundLinkCount: () => 0,
        getQueryHitCount: () => 0,
        getLastQueriedAt: () => recentQuery,
      });
      const worker = new PrunerWorker(deps);
      const staleDate = new Date(TEST_NOW);
      staleDate.setFullYear(staleDate.getFullYear() - 1);
      const engram = makeEngram({ modified: staleDate.toISOString() });

      const result = worker.computeStaleness(engram, []);
      // query hit factor should be 0 due to recent query boost
      // But days-since-modified + days-since-referenced + inbound links still contribute
      expect(result.score).toBeLessThan(1);
    });

    it('exposes factor breakdown in the result', () => {
      const deps = makeDeps({
        getInboundLinkCount: () => 5,
        getQueryHitCount: () => 10,
        getLastQueriedAt: () => new Date('2026-04-01T00:00:00Z'),
      });
      const worker = new PrunerWorker(deps);
      const engram = makeEngram({ modified: '2026-03-01T00:00:00Z' });

      const result = worker.computeStaleness(engram, []);
      expect(result.factors).toEqual({
        daysSinceModified: expect.any(Number),
        daysSinceReferenced: expect.any(Number),
        inboundLinkCount: 5,
        queryHitCount: 10,
      });
      expect(result.factors.daysSinceModified).toBeGreaterThan(0);
    });

    it('defaults query hit to max staleness when no counter exists', () => {
      const deps = makeDeps({
        getInboundLinkCount: () => 20,
        getQueryHitCount: () => 0, // no counter
        // getLastQueriedAt defaults to undefined
      });
      const worker = new PrunerWorker(deps);
      const engram = makeEngram({ modified: TEST_NOW.toISOString() });

      const result = worker.computeStaleness(engram, []);
      // query hit factor contributes 0.2 * 1.0 = 0.2
      // days since referenced also contributes max due to no last queried
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('run()', () => {
    let engramSvc: ReturnType<typeof mockEngramService>;
    let searchSvc: ReturnType<typeof mockSearchService>;
    let staleEngram: Engram;
    let freshEngram: Engram;

    beforeEach(() => {
      engramSvc = mockEngramService();
      searchSvc = mockSearchService();

      const staleDate = new Date(TEST_NOW);
      staleDate.setFullYear(staleDate.getFullYear() - 1);
      staleEngram = makeEngram({
        id: 'eng_20250101_1200_stale',
        modified: staleDate.toISOString(),
        title: 'Stale Note',
      });

      freshEngram = makeEngram({
        id: 'eng_20260427_1000_fresh',
        modified: TEST_NOW.toISOString(),
        title: 'Fresh Note',
      });

      engramSvc.list.mockReturnValue({
        engrams: [staleEngram, freshEngram],
        total: 2,
      });
    });

    it('proposes archival for engrams above the staleness threshold', async () => {
      const worker = new PrunerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        getInboundLinkCount: () => 0,
        getQueryHitCount: () => 0,
      });

      const result = await worker.run(true);
      expect(result.actions.length).toBeGreaterThanOrEqual(1);
      expect(result.actions[0]?.actionType).toBe('prune');
      expect(result.actions[0]?.affectedIds).toContain('eng_20250101_1200_stale');
      expect(result.actions[0]?.status).toBe('proposed');
    });

    it('does not archive in propose phase', async () => {
      const worker = new PrunerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        getInboundLinkCount: () => 0,
        getQueryHitCount: () => 0,
      });

      await worker.run(true);
      expect(engramSvc.archive).not.toHaveBeenCalled();
    });

    it('archives engrams in act_report phase', async () => {
      const worker = new PrunerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        getInboundLinkCount: () => 0,
        getQueryHitCount: () => 0,
        trustProvider: { getPhase: () => 'act_report' as TrustPhase },
      });

      const result = await worker.run(false);
      const staleActions = result.actions.filter((a) =>
        a.affectedIds.includes('eng_20250101_1200_stale')
      );
      expect(staleActions.length).toBeGreaterThanOrEqual(1);
      expect(engramSvc.archive).toHaveBeenCalledWith('eng_20250101_1200_stale');
      expect(staleActions[0]?.status).toBe('executed');
    });

    it('dryRun forces propose mode regardless of trust phase', async () => {
      const worker = new PrunerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        getInboundLinkCount: () => 0,
        getQueryHitCount: () => 0,
        trustProvider: { getPhase: () => 'act_report' as TrustPhase },
      });

      await worker.run(true); // dryRun = true
      expect(engramSvc.archive).not.toHaveBeenCalled();
    });

    it('skips archived engrams', async () => {
      engramSvc.list.mockReturnValue({
        engrams: [makeEngram({ status: 'archived', id: 'eng_20250101_1200_arch' })],
        total: 1,
      });

      const worker = new PrunerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run();
      expect(result.processed).toBe(0);
      expect(result.actions).toHaveLength(0);
    });

    it('skips consolidated engrams', async () => {
      engramSvc.list.mockReturnValue({
        engrams: [makeEngram({ status: 'consolidated', id: 'eng_20250101_1200_cons' })],
        total: 1,
      });

      const worker = new PrunerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run();
      expect(result.processed).toBe(0);
    });

    it('skips engrams with .secret. scope segment', async () => {
      engramSvc.list.mockReturnValue({
        engrams: [
          makeEngram({
            id: 'eng_20250101_1200_secret',
            scopes: ['personal.secret.diary'],
            modified: '2024-01-01T00:00:00Z',
          }),
        ],
        total: 1,
      });

      const worker = new PrunerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        getInboundLinkCount: () => 0,
        getQueryHitCount: () => 0,
      });

      const result = await worker.run();
      expect(result.processed).toBe(0);
      expect(result.actions).toHaveLength(0);
    });

    it('uses lower threshold for orphans', async () => {
      const orphan = makeEngram({
        id: 'eng_20260101_1200_orphan',
        modified: '2025-12-01T00:00:00Z', // ~5 months old
        title: 'Orphan Note',
      });

      engramSvc.list.mockReturnValue({
        engrams: [orphan],
        total: 1,
      });

      const worker = new PrunerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        getInboundLinkCount: () => 0,
        getQueryHitCount: () => 0,
        config: { orphanThreshold: 0.4, stalenessThreshold: 0.9 },
      });

      const result = await worker.run();
      // The orphan should be flagged with the lower threshold
      expect(result.actions.length).toBeGreaterThanOrEqual(1);
      const orphanAction = result.actions.find((a) => a.affectedIds.includes(orphan.id));
      expect(orphanAction).toBeDefined();
      expect(orphanAction?.payload['isOrphan']).toBe(true);
    });

    it('generates a rationale with dominant factor and modification date', async () => {
      engramSvc.list.mockReturnValue({
        engrams: [staleEngram],
        total: 1,
      });

      const worker = new PrunerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        getInboundLinkCount: () => 0,
        getQueryHitCount: () => 0,
      });

      const result = await worker.run();
      expect(result.actions[0]?.rationale).toContain('Staleness score:');
      expect(result.actions[0]?.rationale).toContain('Dominant factor:');
      expect(result.actions[0]?.rationale).toContain('Last modified:');
    });
  });
});
