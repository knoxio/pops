/**
 * Tests for ConsolidatorWorker (US-02, PRD-085).
 *
 * Covers: cluster detection, merge plan generation, max cluster size splitting,
 * scope isolation, secret scope skipping, and trust phase behaviour.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { ConsolidatorWorker } from '../consolidator.js';
import {
  makeEngram,
  makeRetrievalResult,
  mockEngramService,
  mockSearchService,
  narrowPayload,
  TEST_NOW,
} from './fixtures.js';

import type { EngramService } from '../../engrams/service.js';
import type { Engram } from '../../engrams/types.js';
import type { HybridSearchService } from '../../retrieval/hybrid-search.js';
import type { ConsolidatePayload, TrustPhase } from '../types.js';

describe('ConsolidatorWorker', () => {
  let engramSvc: ReturnType<typeof mockEngramService>;
  let searchSvc: ReturnType<typeof mockSearchService>;
  let clusterEngrams: Engram[];

  beforeEach(() => {
    engramSvc = mockEngramService();
    searchSvc = mockSearchService();

    clusterEngrams = [
      makeEngram({
        id: 'eng_20260101_1200_a',
        title: 'Topic Alpha Part 1',
        scopes: ['work.projects'],
        tags: ['topic:alpha', 'status:active'],
        links: [],
      }),
      makeEngram({
        id: 'eng_20260102_1200_b',
        title: 'Topic Alpha Part 2',
        scopes: ['work.projects'],
        tags: ['topic:alpha', 'tool:react'],
        links: ['eng_20260101_1200_a'],
      }),
      makeEngram({
        id: 'eng_20260103_1200_c',
        title: 'Topic Alpha Notes',
        scopes: ['work.projects'],
        tags: ['topic:alpha'],
        links: [],
      }),
    ];

    engramSvc.list.mockReturnValue({
      engrams: clusterEngrams,
      total: 3,
    });

    // Each engram returns the other two as similar (above 0.85)
    searchSvc.similar.mockImplementation(async (engramId: string) => {
      const otherIds = clusterEngrams
        .filter((e) => e.id !== engramId)
        .map((e) =>
          makeRetrievalResult({
            sourceId: e.id,
            sourceType: 'engram',
            score: 0.9,
            title: e.title,
          })
        );
      return otherIds;
    });

    engramSvc.read.mockImplementation((id: string) => {
      const engram = clusterEngrams.find((e) => e.id === id) ?? clusterEngrams[0]!;
      return { engram, body: `Content for ${engram.title}` };
    });
  });

  describe('cluster detection', () => {
    it('detects a cluster of 3+ similar engrams in the same scope', async () => {
      const worker = new ConsolidatorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      expect(result.actions.length).toBeGreaterThanOrEqual(1);
      const action = result.actions[0]!;
      expect(action.actionType).toBe('consolidate');
      expect(action.affectedIds.length).toBeGreaterThanOrEqual(3);
    });

    it('does not cluster engrams below the similarity threshold', async () => {
      searchSvc.similar.mockResolvedValue([
        makeRetrievalResult({ sourceId: 'eng_20260101_1200_a', score: 0.5 }),
      ]);

      const worker = new ConsolidatorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      expect(result.actions).toHaveLength(0);
    });

    it('does not cluster engrams across different top-level scopes', async () => {
      const crossScopeEngrams = [
        makeEngram({ id: 'eng_1', scopes: ['work.projects'], title: 'Work A' }),
        makeEngram({ id: 'eng_2', scopes: ['work.projects'], title: 'Work B' }),
        makeEngram({ id: 'eng_3', scopes: ['personal.notes'], title: 'Personal A' }),
      ];

      engramSvc.list.mockReturnValue({ engrams: crossScopeEngrams, total: 3 });

      searchSvc.similar.mockImplementation(async (engramId: string) => {
        return crossScopeEngrams
          .filter((e) => e.id !== engramId)
          .map((e) => makeRetrievalResult({ sourceId: e.id, sourceType: 'engram', score: 0.95 }));
      });

      const worker = new ConsolidatorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      // Each scope group has fewer than 3 engrams, so no clusters
      expect(result.actions).toHaveLength(0);
    });

    it('requires minimum 3 engrams for a cluster', async () => {
      engramSvc.list.mockReturnValue({
        engrams: clusterEngrams.slice(0, 2),
        total: 2,
      });

      const worker = new ConsolidatorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      expect(result.actions).toHaveLength(0);
    });
  });

  describe('merge plan generation', () => {
    it('produces a merge plan with union of tags (deduplicated)', async () => {
      const worker = new ConsolidatorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      const payload = narrowPayload<ConsolidatePayload>(result.actions[0]!, 'merge');
      expect(payload.mergedTags).toEqual(
        expect.arrayContaining(['topic:alpha', 'status:active', 'tool:react'])
      );
      // No duplicates
      const uniqueTags = new Set(payload.mergedTags);
      expect(uniqueTags.size).toBe(payload.mergedTags.length);
    });

    it('includes source credits in the merged body', async () => {
      const worker = new ConsolidatorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      const payload = narrowPayload<ConsolidatePayload>(result.actions[0]!, 'merge');
      expect(payload.mergedBody).toContain('## Sources');
      expect(payload.mergedBody).toContain('eng_20260101_1200_a');
      expect(payload.mergedBody).toContain('eng_20260102_1200_b');
      expect(payload.mergedBody).toContain('eng_20260103_1200_c');
    });

    it('excludes intra-cluster links from the merged links list', async () => {
      const worker = new ConsolidatorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      const payload = narrowPayload<ConsolidatePayload>(result.actions[0]!, 'merge');
      // eng_b links to eng_a, which is in the cluster — should be excluded
      expect(payload.mergedLinks).not.toContain('eng_20260101_1200_a');
    });
  });

  describe('max cluster size splitting', () => {
    it('splits clusters exceeding maxClusterSize', async () => {
      // Create 12 engrams
      const largeCluster: Engram[] = Array.from({ length: 12 }, (_, i) =>
        makeEngram({
          id: `eng_2026010${String(i + 1).padStart(2, '0')}_1200_e${i}`,
          title: `Topic ${i}`,
          scopes: ['work.projects'],
          tags: ['topic:big'],
        })
      );

      engramSvc.list.mockReturnValue({ engrams: largeCluster, total: 12 });

      searchSvc.similar.mockImplementation(async (engramId: string) => {
        return largeCluster
          .filter((e) => e.id !== engramId)
          .map((e) => makeRetrievalResult({ sourceId: e.id, sourceType: 'engram', score: 0.95 }));
      });

      engramSvc.read.mockImplementation((id: string) => {
        const engram = largeCluster.find((e) => e.id === id) ?? largeCluster[0]!;
        return { engram, body: `Content ${id}` };
      });

      const worker = new ConsolidatorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        config: { maxClusterSize: 5 },
      });

      const result = await worker.run(true);
      // 12 engrams with max 5 per cluster = at least 2 sub-clusters
      expect(result.actions.length).toBeGreaterThanOrEqual(2);
      for (const action of result.actions) {
        expect(action.affectedIds.length).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('trust phase behaviour', () => {
    it('only proposes in propose phase (no archiving)', async () => {
      const worker = new ConsolidatorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      await worker.run(true);
      expect(engramSvc.archive).not.toHaveBeenCalled();
      expect(engramSvc.create).not.toHaveBeenCalled();
    });

    it('creates merged engram and archives originals in act_report phase', async () => {
      const worker = new ConsolidatorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        trustProvider: { getPhase: () => 'act_report' as TrustPhase },
      });

      await worker.run(false);
      expect(engramSvc.create).toHaveBeenCalled();
      expect(engramSvc.archive).toHaveBeenCalledTimes(3); // 3 originals
    });
  });

  describe('filtering', () => {
    it('skips engrams with .secret. scope', async () => {
      engramSvc.list.mockReturnValue({
        engrams: [
          makeEngram({
            id: 'eng_secret',
            scopes: ['work.secret.keys'],
            status: 'active',
          }),
        ],
        total: 1,
      });

      const worker = new ConsolidatorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      expect(result.actions).toHaveLength(0);
    });
  });
});
