/**
 * Tests for LinkerWorker (US-03, PRD-085).
 *
 * Covers: low-link candidate detection, similarity matching, duplicate avoidance,
 * scope boundary enforcement, max proposals per engram, and trust phase behaviour.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { LinkerWorker } from '../linker.js';
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
import type { LinkPayload, TrustPhase } from '../types.js';

describe('LinkerWorker', () => {
  let engramSvc: ReturnType<typeof mockEngramService>;
  let searchSvc: ReturnType<typeof mockSearchService>;
  let engramA: Engram;
  let engramB: Engram;
  let engramC: Engram;

  beforeEach(() => {
    engramSvc = mockEngramService();
    searchSvc = mockSearchService();

    engramA = makeEngram({
      id: 'eng_20260101_1200_a',
      title: 'LangGraph Routing',
      scopes: ['work.projects'],
      tags: ['topic:langgraph', 'topic:routing'],
      links: [], // 0 links — candidate
    });

    engramB = makeEngram({
      id: 'eng_20260102_1200_b',
      title: 'Agent Coordination Patterns',
      scopes: ['work.projects'],
      tags: ['topic:agents', 'topic:routing'],
      links: ['eng_20260103_1200_c', 'eng_20260104_1200_d'], // 2 links — not a candidate
    });

    engramC = makeEngram({
      id: 'eng_20260103_1200_c',
      title: 'Personal Note',
      scopes: ['personal.notes'],
      tags: ['topic:routing'],
      links: [], // 0 links — candidate, but different scope
    });

    engramSvc.list.mockReturnValue({
      engrams: [engramA, engramB, engramC],
      total: 3,
    });
  });

  describe('candidate detection', () => {
    it('identifies engrams with fewer than minLinkThreshold outbound links', async () => {
      searchSvc.similar.mockResolvedValue([]);

      const worker = new LinkerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      // Should have processed engramA and engramC (both have < 2 links)
      expect(result.processed).toBe(2);
    });

    it('does not process engrams with enough outbound links', async () => {
      searchSvc.similar.mockResolvedValue([]);

      const worker = new LinkerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      // engramB has 2 links, so it should not be processed
      await worker.run(true);
      expect(searchSvc.similar).not.toHaveBeenCalledWith('eng_20260102_1200_b', expect.anything());
    });
  });

  describe('similarity matching', () => {
    it('proposes bidirectional links for semantically similar engrams', async () => {
      searchSvc.similar.mockImplementation(async (engramId: string) => {
        if (engramId === 'eng_20260101_1200_a') {
          return [
            makeRetrievalResult({
              sourceId: 'eng_20260102_1200_b',
              sourceType: 'engram',
              score: 0.85,
            }),
          ];
        }
        return [];
      });

      const worker = new LinkerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      expect(result.actions.length).toBeGreaterThanOrEqual(1);
      const linkAction = result.actions.find(
        (a) =>
          a.affectedIds.includes('eng_20260101_1200_a') &&
          a.affectedIds.includes('eng_20260102_1200_b')
      );
      expect(linkAction).toBeDefined();
      expect(linkAction?.actionType).toBe('link');
    });

    it('includes shared tags in the link reason', async () => {
      searchSvc.similar.mockImplementation(async (engramId: string) => {
        if (engramId === 'eng_20260101_1200_a') {
          return [
            makeRetrievalResult({
              sourceId: 'eng_20260102_1200_b',
              sourceType: 'engram',
              score: 0.8,
            }),
          ];
        }
        return [];
      });

      const worker = new LinkerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      const linkAction = result.actions[0];
      expect(linkAction).toBeDefined();
      const payload = narrowPayload<LinkPayload>(linkAction!, 'link');
      expect(payload.reason).toContain('topic:routing');
    });
  });

  describe('duplicate avoidance', () => {
    it('does not propose a link that already exists', async () => {
      const linked = makeEngram({
        ...engramA,
        links: ['eng_20260102_1200_b'], // already linked to B
      });

      engramSvc.list.mockReturnValue({
        engrams: [linked, engramB],
        total: 2,
      });

      searchSvc.similar.mockImplementation(async (engramId: string) => {
        if (engramId === 'eng_20260101_1200_a') {
          return [
            makeRetrievalResult({
              sourceId: 'eng_20260102_1200_b',
              sourceType: 'engram',
              score: 0.95,
            }),
          ];
        }
        return [];
      });

      const worker = new LinkerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      // No link proposals since A->B already exists
      const abLinks = result.actions.filter(
        (a) =>
          a.affectedIds.includes('eng_20260101_1200_a') &&
          a.affectedIds.includes('eng_20260102_1200_b')
      );
      expect(abLinks).toHaveLength(0);
    });

    it('does not propose the same pair twice in the same run', async () => {
      // Both A and C are candidates. If both would link to B, only one proposal.
      const engramD = makeEngram({
        id: 'eng_20260104_1200_d',
        title: 'Another Topic',
        scopes: ['work.projects'],
        tags: ['topic:routing'],
        links: [], // candidate
      });

      engramSvc.list.mockReturnValue({
        engrams: [engramA, engramB, engramD],
        total: 3,
      });

      searchSvc.similar.mockImplementation(async (engramId: string) => {
        if (engramId === 'eng_20260101_1200_a') {
          return [
            makeRetrievalResult({
              sourceId: 'eng_20260104_1200_d',
              sourceType: 'engram',
              score: 0.9,
            }),
          ];
        }
        if (engramId === 'eng_20260104_1200_d') {
          return [
            makeRetrievalResult({
              sourceId: 'eng_20260101_1200_a',
              sourceType: 'engram',
              score: 0.9,
            }),
          ];
        }
        return [];
      });

      const worker = new LinkerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      // Should only have one proposal for A<->D, not two
      const adPairs = result.actions.filter(
        (a) =>
          a.affectedIds.includes('eng_20260101_1200_a') &&
          a.affectedIds.includes('eng_20260104_1200_d')
      );
      expect(adPairs).toHaveLength(1);
    });
  });

  describe('scope boundaries', () => {
    it('does not propose links across top-level scope boundaries', async () => {
      searchSvc.similar.mockImplementation(async (engramId: string) => {
        if (engramId === 'eng_20260101_1200_a') {
          return [
            makeRetrievalResult({
              sourceId: 'eng_20260103_1200_c', // personal scope
              sourceType: 'engram',
              score: 0.95,
            }),
          ];
        }
        return [];
      });

      const worker = new LinkerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      // A is work.*, C is personal.* — no cross-scope link
      const crossScopeActions = result.actions.filter(
        (a) =>
          a.affectedIds.includes('eng_20260101_1200_a') &&
          a.affectedIds.includes('eng_20260103_1200_c')
      );
      expect(crossScopeActions).toHaveLength(0);
    });
  });

  describe('max proposals per engram', () => {
    it('limits proposals to maxProposalsPerEngram', async () => {
      const targets = Array.from({ length: 10 }, (_, i) =>
        makeEngram({
          id: `eng_target_${i}`,
          scopes: ['work.projects'],
          tags: ['topic:routing'],
          links: ['some-link', 'another-link'], // not candidates
        })
      );

      engramSvc.list.mockReturnValue({
        engrams: [engramA, ...targets],
        total: 11,
      });

      searchSvc.similar.mockImplementation(async (engramId: string) => {
        if (engramId === 'eng_20260101_1200_a') {
          return targets.map((t) =>
            makeRetrievalResult({ sourceId: t.id, sourceType: 'engram', score: 0.9 })
          );
        }
        return [];
      });

      const worker = new LinkerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        config: { maxProposalsPerEngram: 5 },
      });

      const result = await worker.run(true);
      const aActions = result.actions.filter((a) => a.affectedIds.includes('eng_20260101_1200_a'));
      expect(aActions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('trust phase behaviour', () => {
    it('does not call link in propose phase', async () => {
      searchSvc.similar.mockImplementation(async (engramId: string) => {
        if (engramId === 'eng_20260101_1200_a') {
          return [
            makeRetrievalResult({
              sourceId: 'eng_20260102_1200_b',
              sourceType: 'engram',
              score: 0.85,
            }),
          ];
        }
        return [];
      });

      const worker = new LinkerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      await worker.run(true);
      expect(engramSvc.link).not.toHaveBeenCalled();
    });

    it('creates bidirectional links in act_report phase', async () => {
      searchSvc.similar.mockImplementation(async (engramId: string) => {
        if (engramId === 'eng_20260101_1200_a') {
          return [
            makeRetrievalResult({
              sourceId: 'eng_20260102_1200_b',
              sourceType: 'engram',
              score: 0.85,
            }),
          ];
        }
        return [];
      });

      const worker = new LinkerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        trustProvider: { getPhase: () => 'act_report' as TrustPhase },
      });

      await worker.run(false);
      // Should create both directions
      expect(engramSvc.link).toHaveBeenCalledWith('eng_20260101_1200_a', 'eng_20260102_1200_b');
      expect(engramSvc.link).toHaveBeenCalledWith('eng_20260102_1200_b', 'eng_20260101_1200_a');
    });
  });

  describe('filtering', () => {
    it('skips engrams with .secret. scope', async () => {
      engramSvc.list.mockReturnValue({
        engrams: [
          makeEngram({
            id: 'eng_secret',
            scopes: ['work.secret.keys'],
            links: [],
          }),
        ],
        total: 1,
      });

      const worker = new LinkerWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      expect(result.processed).toBe(0);
    });
  });
});
