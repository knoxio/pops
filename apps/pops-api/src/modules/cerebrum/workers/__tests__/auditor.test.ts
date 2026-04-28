/**
 * Tests for AuditorWorker (US-04, PRD-085).
 *
 * Covers: quality scoring, low-quality flagging, contradiction detection,
 * coverage gap detection, secret scope skipping, and trust phase behaviour.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { AuditorWorker } from '../auditor.js';
import {
  makeEngram,
  mockEngramService,
  mockSearchService,
  narrowPayload,
  TEST_NOW,
} from './fixtures.js';

import type { EngramService } from '../../engrams/service.js';
import type { HybridSearchService } from '../../retrieval/hybrid-search.js';
import type { ContradictionDetector } from '../auditor.js';
import type {
  ContradictionPayload,
  CoverageGapPayload,
  GliaAction,
  LowQualityPayload,
  TrustPhase,
} from '../types.js';

/** Filter actions by payload type discriminant. */
function byPayloadType(actions: GliaAction[], type: string): GliaAction[] {
  return actions.filter((a) => a.payload['type'] === type);
}

describe('AuditorWorker', () => {
  let engramSvc: ReturnType<typeof mockEngramService>;
  let searchSvc: ReturnType<typeof mockSearchService>;

  beforeEach(() => {
    engramSvc = mockEngramService();
    searchSvc = mockSearchService();
  });

  describe('quality scoring', () => {
    it('scores high for a well-formed engram', () => {
      engramSvc.read.mockReturnValue({
        engram: makeEngram(),
        body: 'This is a detailed body with proper dates 2026-01-15 and specific references to LangGraph routing patterns. It discusses Agent Coordination in depth with quantifiable results showing 95% improvement over 6 months of testing. See https://example.com for more details.',
      });

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const engram = makeEngram({
        wordCount: 120,
        tags: ['topic:langgraph', 'topic:routing'],
        links: ['eng_other_1', 'eng_other_2'],
        template: 'research',
      });

      const result = worker.computeQuality(engram);
      expect(result.score).toBeGreaterThan(0.3);
    });

    it('scores low for a minimal engram', () => {
      engramSvc.read.mockReturnValue({
        engram: makeEngram(),
        body: 'Short note.',
      });

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const engram = makeEngram({
        wordCount: 5,
        tags: [],
        links: [],
        template: null,
      });

      const result = worker.computeQuality(engram);
      expect(result.score).toBeLessThan(0.3);
    });

    it('assigns neutral template fit (0.5) for engrams without a template', () => {
      engramSvc.read.mockReturnValue({
        engram: makeEngram(),
        body: 'Some body content.',
      });

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const engram = makeEngram({ template: null });
      const result = worker.computeQuality(engram);
      expect(result.factors.templateFit).toBe(0.5);
    });

    it('scores completeness based on title, body, scope, and tags', () => {
      engramSvc.read.mockReturnValue({
        engram: makeEngram(),
        body: 'Some body.',
      });

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      // Has title and scope, but low word count and no tags -> 2/4 = 0.5
      const engram = makeEngram({
        title: 'Good Title',
        wordCount: 10,
        tags: [],
        scopes: ['work.projects'],
      });

      const result = worker.computeQuality(engram);
      expect(result.factors.completeness).toBe(0.5);
    });

    it('scores link density based on outbound link count', () => {
      engramSvc.read.mockReturnValue({
        engram: makeEngram(),
        body: 'Content.',
      });

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const engram = makeEngram({ links: ['a', 'b', 'c', 'd', 'e'] });
      const result = worker.computeQuality(engram);
      expect(result.factors.linkDensity).toBe(0.5); // 5/10
    });

    it('exposes factor breakdown in the result', () => {
      engramSvc.read.mockReturnValue({
        engram: makeEngram(),
        body: 'Some content with 2026-04-27 date.',
      });

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const engram = makeEngram();
      const result = worker.computeQuality(engram);
      expect(result.factors).toEqual(
        expect.objectContaining({
          completeness: expect.any(Number),
          specificity: expect.any(Number),
          templateFit: expect.any(Number),
          linkDensity: expect.any(Number),
        })
      );
    });
  });

  describe('low-quality flagging', () => {
    it('flags engrams below the quality threshold', async () => {
      const poorEngram = makeEngram({
        id: 'eng_20260101_1200_poor',
        title: 'Untitled',
        wordCount: 5,
        tags: [],
        links: [],
        template: null,
      });

      engramSvc.list.mockReturnValue({ engrams: [poorEngram], total: 1 });
      engramSvc.read.mockReturnValue({ engram: poorEngram, body: 'Short.' });

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      const lowQualityActions = byPayloadType(result.actions, 'low_quality');
      expect(lowQualityActions.length).toBeGreaterThanOrEqual(1);
      const payload = narrowPayload<LowQualityPayload>(lowQualityActions[0]!, 'low_quality');
      expect(payload.score).toBeLessThan(0.3);
      expect(payload.suggestions.length).toBeGreaterThan(0);
    });

    it('does not flag engrams above the quality threshold', async () => {
      const goodEngram = makeEngram({
        id: 'eng_20260101_1200_good',
        title: 'Detailed Research',
        wordCount: 200,
        tags: ['topic:ai', 'topic:routing'],
        links: ['eng_a', 'eng_b', 'eng_c'],
        template: 'research',
      });

      engramSvc.list.mockReturnValue({ engrams: [goodEngram], total: 1 });
      engramSvc.read.mockReturnValue({
        engram: goodEngram,
        body: '# Overview\n\nDetailed content with dates 2026-01-15 and numbers 95% improvement.\n\n## Methods\n\nUsing LangGraph for routing...\n\n## Results\n\nSee https://example.com\n\n## Conclusion\n\nFinal thoughts on Agent Coordination patterns.',
      });

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        config: { qualityThreshold: 0.3 },
      });

      const result = await worker.run(true);
      const lowQualityActions = byPayloadType(result.actions, 'low_quality');
      expect(lowQualityActions).toHaveLength(0);
    });

    it('generates actionable improvement suggestions', async () => {
      const poorEngram = makeEngram({
        id: 'eng_poor',
        wordCount: 10,
        tags: [],
        links: [],
      });

      engramSvc.list.mockReturnValue({ engrams: [poorEngram], total: 1 });
      engramSvc.read.mockReturnValue({ engram: poorEngram, body: 'Short note.' });

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      const lowQuality = byPayloadType(result.actions, 'low_quality')[0];
      expect(lowQuality).toBeDefined();
      const payload = narrowPayload<LowQualityPayload>(lowQuality!, 'low_quality');
      expect(payload.suggestions).toEqual(
        expect.arrayContaining([expect.stringContaining('Expand body content')])
      );
    });
  });

  describe('contradiction detection', () => {
    it('detects contradictions between engrams sharing tags in same scope', async () => {
      const engramA = makeEngram({
        id: 'eng_a',
        scopes: ['work.projects'],
        tags: ['topic:deployment'],
      });
      const engramB = makeEngram({
        id: 'eng_b',
        scopes: ['work.projects'],
        tags: ['topic:deployment'],
        wordCount: 100,
      });

      engramSvc.list.mockReturnValue({ engrams: [engramA, engramB], total: 2 });
      engramSvc.read.mockImplementation((id: string) => {
        if (id === 'eng_a') return { engram: engramA, body: 'Deploy on Fridays is fine.' };
        return { engram: engramB, body: 'Never deploy on Fridays.' };
      });

      const mockDetector: ContradictionDetector = {
        detectContradiction: async () => 'Conflicting views on Friday deployments',
      };

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        contradictionDetector: mockDetector,
        config: { qualityThreshold: 0.0 }, // Don't flag quality to isolate contradiction test
      });

      const result = await worker.run(true);
      const contradictions = byPayloadType(result.actions, 'contradiction');
      expect(contradictions).toHaveLength(1);
      const payload = narrowPayload<ContradictionPayload>(contradictions[0]!, 'contradiction');
      expect(payload.engramA).toBe('eng_a');
      expect(payload.engramB).toBe('eng_b');
      expect(payload.conflictSummary).toContain('Friday');
    });

    it('does not check for contradictions across top-level scopes', async () => {
      const workEngram = makeEngram({
        id: 'eng_work',
        scopes: ['work.projects'],
        tags: ['topic:deployment'],
      });
      const personalEngram = makeEngram({
        id: 'eng_personal',
        scopes: ['personal.notes'],
        tags: ['topic:deployment'],
      });

      engramSvc.list.mockReturnValue({ engrams: [workEngram, personalEngram], total: 2 });

      const mockDetector: ContradictionDetector = {
        detectContradiction: async () => 'Should never be called',
      };

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        contradictionDetector: mockDetector,
        config: { qualityThreshold: 0.0 },
      });

      const result = await worker.run(true);
      const contradictions = byPayloadType(result.actions, 'contradiction');
      // Different top-level scopes: work vs personal — no comparison
      expect(contradictions).toHaveLength(0);
    });

    it('handles LLM failure with error status', async () => {
      const engramA = makeEngram({
        id: 'eng_a',
        scopes: ['work.projects'],
        tags: ['topic:test'],
      });
      const engramB = makeEngram({
        id: 'eng_b',
        scopes: ['work.projects'],
        tags: ['topic:test'],
      });

      engramSvc.list.mockReturnValue({ engrams: [engramA, engramB], total: 2 });
      engramSvc.read.mockReturnValue({ engram: engramA, body: 'Content' });

      const failingDetector: ContradictionDetector = {
        detectContradiction: async () => {
          throw new Error('LLM API down');
        },
      };

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        contradictionDetector: failingDetector,
        config: { qualityThreshold: 0.0 },
      });

      const result = await worker.run(true);
      const errorActions = result.actions.filter((a) => a.status === 'error');
      expect(errorActions.length).toBeGreaterThanOrEqual(1);
    });

    it('only compares engrams that share tags', async () => {
      const engramA = makeEngram({
        id: 'eng_a',
        scopes: ['work.projects'],
        tags: ['topic:alpha'],
      });
      const engramB = makeEngram({
        id: 'eng_b',
        scopes: ['work.projects'],
        tags: ['topic:beta'], // different tags
      });

      engramSvc.list.mockReturnValue({ engrams: [engramA, engramB], total: 2 });

      const detector: ContradictionDetector = {
        detectContradiction: async () => 'Should never be called',
      };

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        contradictionDetector: detector,
        config: { qualityThreshold: 0.0 },
      });

      const result = await worker.run(true);
      const contradictions = byPayloadType(result.actions, 'contradiction');
      expect(contradictions).toHaveLength(0);
    });
  });

  describe('coverage gap detection', () => {
    it('flags topics with fewer than minimum engrams', async () => {
      const engram = makeEngram({
        id: 'eng_lonely',
        tags: ['topic:rare-topic'],
        wordCount: 100,
      });

      engramSvc.list.mockReturnValue({ engrams: [engram], total: 1 });
      engramSvc.read.mockReturnValue({
        engram,
        body: 'Detailed content about the rare topic with dates 2026-01-15 and numbers 95%.',
      });

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        config: { qualityThreshold: 0.0, minEngramsPerTopic: 2 },
      });

      const result = await worker.run(true);
      const gaps = byPayloadType(result.actions, 'gap');
      expect(gaps.length).toBeGreaterThanOrEqual(1);
      const gapPayload = narrowPayload<CoverageGapPayload>(gaps[0]!, 'gap');
      expect(gapPayload.topic).toBe('topic:rare-topic');
      expect(gapPayload.existingCount).toBe(1);
    });

    it('does not flag topics that meet the minimum', async () => {
      const engrams = [
        makeEngram({ id: 'eng_a', tags: ['topic:popular'] }),
        makeEngram({ id: 'eng_b', tags: ['topic:popular'] }),
        makeEngram({ id: 'eng_c', tags: ['topic:popular'] }),
      ];

      engramSvc.list.mockReturnValue({ engrams, total: 3 });
      engramSvc.read.mockReturnValue({
        engram: engrams[0]!,
        body: 'Detailed content with dates 2026-01-15 and references to specific topics.',
      });

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        config: { qualityThreshold: 0.0, minEngramsPerTopic: 2 },
      });

      const result = await worker.run(true);
      const gaps = byPayloadType(result.actions, 'gap');
      // topic:popular has 3 engrams, above minimum of 2
      const popularGap = gaps.find((g) => (g.payload['topic'] as string) === 'topic:popular');
      expect(popularGap).toBeUndefined();
    });
  });

  describe('trust phase behaviour', () => {
    it('all actions are proposed in propose phase', async () => {
      const engram = makeEngram({ id: 'eng_test', wordCount: 5, tags: [], links: [] });
      engramSvc.list.mockReturnValue({ engrams: [engram], total: 1 });
      engramSvc.read.mockReturnValue({ engram, body: 'Short.' });

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      for (const action of result.actions) {
        expect(action.status).toBe('proposed');
      }
    });

    it('auditor never modifies engrams even in act_report phase', async () => {
      const engram = makeEngram({ id: 'eng_test', wordCount: 5, tags: [], links: [] });
      engramSvc.list.mockReturnValue({ engrams: [engram], total: 1 });
      engramSvc.read.mockReturnValue({ engram, body: 'Short.' });

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
        trustProvider: { getPhase: () => 'act_report' as TrustPhase },
      });

      await worker.run(false);
      expect(engramSvc.update).not.toHaveBeenCalled();
      expect(engramSvc.archive).not.toHaveBeenCalled();
    });
  });

  describe('filtering', () => {
    it('skips engrams with .secret. scope', async () => {
      engramSvc.list.mockReturnValue({
        engrams: [
          makeEngram({
            id: 'eng_secret',
            scopes: ['work.secret.keys'],
          }),
        ],
        total: 1,
      });

      const worker = new AuditorWorker({
        engramService: engramSvc as unknown as EngramService,
        searchService: searchSvc as unknown as HybridSearchService,
        now: () => TEST_NOW,
      });

      const result = await worker.run(true);
      expect(result.processed).toBe(0);
    });
  });
});
