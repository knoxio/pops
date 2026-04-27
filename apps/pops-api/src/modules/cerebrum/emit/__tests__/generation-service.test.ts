import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RetrievalResult } from '../../retrieval/types.js';
import type { GenerationService as GenerationServiceType } from '../generation-service.js';

// Mock external dependencies before importing the service.
vi.mock('../../../../db.js', () => ({
  getDrizzle: vi.fn(),
}));

vi.mock('../../../../env.js', () => ({
  getEnv: vi.fn((key: string) => {
    if (key === 'ANTHROPIC_API_KEY') return 'test-key';
    return undefined;
  }),
}));

vi.mock('../../../../lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../../lib/inference-middleware.js', () => ({
  trackInference: vi.fn((_meta: unknown, fn: () => unknown) => fn()),
}));

vi.mock('../../../../lib/ai-retry.js', () => ({
  withRateLimitRetry: vi.fn((fn: () => unknown) => fn()),
}));

// Mock the LLM caller.
const mockCallLlm = vi.fn<(systemPrompt: string, userMessage: string) => Promise<string>>();
vi.mock('../llm.js', () => ({
  callEmitLlm: (...args: unknown[]) => mockCallLlm(args[0] as string, args[1] as string),
}));

// Mock the HybridSearchService.
const mockHybrid = vi.fn<() => Promise<RetrievalResult[]>>();
vi.mock('../../retrieval/hybrid-search.js', () => {
  return {
    HybridSearchService: class MockHybridSearchService {
      hybrid = mockHybrid;
    },
  };
});

// Mock the ContextAssemblyService (depends on retrieval/types only, no @pops/db-types).
vi.mock('../../retrieval/context-assembly.js', () => {
  return {
    ContextAssemblyService: class MockContextAssemblyService {
      assemble = vi.fn((input: { query: string; results: RetrievalResult[] }) => ({
        context: `Query: ${input.query}\n\n${input.results.map((r) => `[${r.sourceType}:${r.sourceId}] ${r.title}\n${r.contentPreview}`).join('\n---\n')}`,
        sources: input.results.map((r) => ({
          sourceType: r.sourceType,
          sourceId: r.sourceId,
          title: r.title,
          relevanceScore: r.score,
        })),
        truncated: false,
        tokenEstimate: 100,
      }));
    },
  };
});

// Dynamic import after mocks are set up.
const { GenerationService } = await import('../generation-service.js');

function makeResult(sourceId: string, metadata: Record<string, unknown> = {}): RetrievalResult {
  return {
    sourceType: 'engram',
    sourceId,
    title: `Engram ${sourceId}`,
    contentPreview: `Content for ${sourceId}. This is some substantive text about the topic.`,
    score: 0.8,
    matchType: 'semantic',
    metadata: {
      scopes: ['work.projects'],
      createdAt: '2026-04-15T10:00:00Z',
      type: 'note',
      ...metadata,
    },
  };
}

describe('GenerationService', () => {
  let service: GenerationServiceType;

  beforeEach(() => {
    service = new GenerationService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------- Report generation ----------

  describe('generateReport', () => {
    it('generates a report with sections and citations', async () => {
      const results = [
        makeResult('eng_20260415_1000_agent-coordination', {
          type: 'decision',
          scopes: ['work.projects.karbon'],
        }),
        makeResult('eng_20260416_0900_architecture-review', {
          type: 'meeting',
          scopes: ['work.projects.karbon'],
        }),
        makeResult('eng_20260417_1400_implementation-plan', {
          type: 'research',
          scopes: ['work.projects.karbon'],
        }),
      ];
      mockHybrid.mockResolvedValueOnce(results);

      mockCallLlm.mockResolvedValueOnce(
        '# Agent Coordination Report\n\n' +
          'Introduction about agent coordination.\n\n' +
          '## Architecture Decisions\n\n' +
          'The team decided on a modular approach [eng_20260415_1000_agent-coordination].\n\n' +
          '## Implementation\n\n' +
          'The implementation plan covers [eng_20260417_1400_implementation-plan].\n\n' +
          '## Conclusion\n\n' +
          'Summary of findings.'
      );

      const result = await service.generateReport({
        mode: 'report',
        query: 'agent coordination decisions',
      });

      expect(result.document).not.toBeNull();
      expect(result.document?.title).toBe('Agent Coordination Report');
      expect(result.document?.mode).toBe('report');
      expect(result.document?.body).toContain('## Architecture Decisions');
      expect(result.document?.body).toContain('## Implementation');
      expect(result.document?.sources.length).toBeGreaterThan(0);
    });

    it('returns notice for zero results', async () => {
      mockHybrid.mockResolvedValueOnce([]);

      const result = await service.generateReport({
        mode: 'report',
        query: 'nonexistent topic',
      });

      expect(result.document).toBeNull();
      expect(result.notice).toBe('No relevant engrams found for this query');
    });

    it('returns notice for insufficient sources (< 2)', async () => {
      mockHybrid.mockResolvedValueOnce([makeResult('eng_1')]);

      const result = await service.generateReport({
        mode: 'report',
        query: 'sparse topic',
      });

      expect(result.document).toBeNull();
      expect(result.notice).toBe('Insufficient data to generate a meaningful report');
    });

    it('applies audience scope filtering', async () => {
      const results = [
        makeResult('eng_1', { scopes: ['work.projects'] }),
        makeResult('eng_2', { scopes: ['personal.journal'] }),
        makeResult('eng_3', { scopes: ['work.meetings'] }),
      ];
      mockHybrid.mockResolvedValueOnce(results);

      mockCallLlm.mockResolvedValueOnce('# Report\n\nFiltered content [eng_1].');

      const result = await service.generateReport({
        mode: 'report',
        query: 'work status',
        audienceScope: 'work.*',
      });

      expect(result.document).not.toBeNull();
      expect(result.document?.audienceScope).toBe('work.*');
    });

    it('excludes secret scopes by default', async () => {
      const results = [
        makeResult('eng_1', { scopes: ['work.projects'] }),
        makeResult('eng_2', { scopes: ['work.secret.salary'] }),
        makeResult('eng_3', { scopes: ['work.meetings'] }),
      ];
      mockHybrid.mockResolvedValueOnce(results);

      mockCallLlm.mockResolvedValueOnce('# Report\n\nContent [eng_1] [eng_3].');

      const result = await service.generateReport({
        mode: 'report',
        query: 'work overview',
      });

      // eng_2 (secret) should be excluded from sources
      expect(result.document).not.toBeNull();
      const sourceIds = result.document?.sources.map((s) => s.id) ?? [];
      expect(sourceIds).not.toContain('eng_2');
    });
  });

  // ---------- Summary generation ----------

  describe('generateSummary', () => {
    it('generates a summary with date range', async () => {
      const results = [
        makeResult('eng_1', { createdAt: '2026-04-01T10:00:00Z', type: 'decision' }),
        makeResult('eng_2', { createdAt: '2026-04-03T10:00:00Z', type: 'meeting' }),
        makeResult('eng_3', { createdAt: '2026-04-05T10:00:00Z', type: 'research' }),
      ];
      mockHybrid.mockResolvedValueOnce(results);

      mockCallLlm.mockResolvedValueOnce(
        '# Weekly Summary: 2026-04-01 to 2026-04-07\n\n' +
          '## Highlights\n\n- Key decision [eng_1]\n\n' +
          '## Decisions\n\n- Decision item [eng_1]\n\n' +
          '## Meetings\n\n- Meeting notes [eng_2]\n\n' +
          '## Research\n\n- Research findings [eng_3]'
      );

      const result = await service.generateSummary({
        mode: 'summary',
        dateRange: { from: '2026-04-01', to: '2026-04-07' },
      });

      expect(result.document).not.toBeNull();
      expect(result.document?.mode).toBe('summary');
      expect(result.document?.body).toContain('## Highlights');
      expect(result.document?.sources).toHaveLength(3);
    });

    it('returns empty summary for zero engrams in date range', async () => {
      mockHybrid.mockResolvedValueOnce([]);

      const result = await service.generateSummary({
        mode: 'summary',
        dateRange: { from: '2026-04-01', to: '2026-04-07' },
      });

      expect(result.document).not.toBeNull();
      expect(result.document?.body).toContain('No engrams found between 2026-04-01 and 2026-04-07');
      expect(result.document?.sources).toHaveLength(0);
    });

    it('groups by type when no topic filter', async () => {
      const results = [
        makeResult('eng_1', { type: 'decision' }),
        makeResult('eng_2', { type: 'meeting' }),
      ];
      mockHybrid.mockResolvedValueOnce(results);

      mockCallLlm.mockResolvedValueOnce(
        '# Summary\n\n## Decisions\n\n- Item [eng_1]\n\n## Meetings\n\n- Item [eng_2]'
      );

      const result = await service.generateSummary({
        mode: 'summary',
        dateRange: { from: '2026-04-01', to: '2026-04-07' },
      });

      expect(result.document).not.toBeNull();
      expect(result.document?.body).toContain('## Decisions');
      expect(result.document?.body).toContain('## Meetings');
    });
  });

  // ---------- Timeline generation ----------

  describe('generateTimeline', () => {
    it('generates a chronological timeline', async () => {
      const results = [
        makeResult('eng_1', { createdAt: '2026-01-15T10:00:00Z', type: 'decision' }),
        makeResult('eng_2', { createdAt: '2026-03-20T10:00:00Z', type: 'meeting' }),
        makeResult('eng_3', { createdAt: '2026-06-10T10:00:00Z', type: 'research' }),
      ];
      mockHybrid.mockResolvedValueOnce(results);

      mockCallLlm.mockResolvedValueOnce(
        '# Decision Timeline\n\n' +
          '**2026-01-15** — [decision] **Architecture Decision** — Chose microservices [eng_1]\n\n' +
          '**2026-03-20** — [meeting] **Review Meeting** — Quarterly review [eng_2]\n\n' +
          '**2026-06-10** — [research] **Performance Study** — Benchmark results [eng_3]'
      );

      const result = await service.generateTimeline({
        mode: 'timeline',
        query: 'decisions over time',
      });

      expect(result.document).not.toBeNull();
      expect(result.document?.mode).toBe('timeline');
      expect(result.document?.title).toBe('Decision Timeline');
      expect(result.document?.dateRange).toEqual({
        from: '2026-01-15T10:00:00Z',
        to: '2026-06-10T10:00:00Z',
      });
    });

    it('returns notice for zero results', async () => {
      mockHybrid.mockResolvedValueOnce([]);

      const result = await service.generateTimeline({
        mode: 'timeline',
      });

      expect(result.document).toBeNull();
      expect(result.notice).toBe('No relevant engrams found for this timeline');
    });

    it('handles single entry timeline', async () => {
      const results = [
        makeResult('eng_1', { createdAt: '2026-04-15T10:00:00Z', type: 'decision' }),
      ];
      mockHybrid.mockResolvedValueOnce(results);

      mockCallLlm.mockResolvedValueOnce(
        '# Timeline\n\n**2026-04-15** — [decision] **Single Decision** — The only entry [eng_1]'
      );

      const result = await service.generateTimeline({
        mode: 'timeline',
      });

      expect(result.document).not.toBeNull();
      expect(result.document?.body).toContain('single point in time');
      expect(result.document?.sources).toHaveLength(1);
    });

    it('applies date range filtering', async () => {
      const results = [
        makeResult('eng_1', { createdAt: '2026-04-01T10:00:00Z' }),
        makeResult('eng_2', { createdAt: '2026-04-15T10:00:00Z' }),
      ];
      mockHybrid.mockResolvedValueOnce(results);

      mockCallLlm.mockResolvedValueOnce('# Timeline\n\nEntries [eng_1] [eng_2].');

      const result = await service.generateTimeline({
        mode: 'timeline',
        dateRange: { from: '2026-04-01', to: '2026-04-30' },
      });

      expect(result.document).not.toBeNull();
      // Verify mockHybrid was called (retrieval happened)
      expect(mockHybrid).toHaveBeenCalled();
    });
  });

  // ---------- Preview ----------

  describe('preview', () => {
    it('returns sources and outline without full generation', async () => {
      const results = [
        makeResult('eng_1', { type: 'decision' }),
        makeResult('eng_2', { type: 'meeting' }),
      ];
      mockHybrid.mockResolvedValueOnce(results);

      mockCallLlm.mockResolvedValueOnce(
        '# Report Outline\n\n- ## Architecture [eng_1]\n- ## Process [eng_2]'
      );

      const preview = await service.preview({
        mode: 'report',
        query: 'agent coordination',
      });

      expect(preview.sources).toHaveLength(2);
      expect(preview.outline).toContain('Architecture');
      expect(preview.outline).toContain('Process');
    });

    it('returns empty outline for zero sources', async () => {
      mockHybrid.mockResolvedValueOnce([]);

      const preview = await service.preview({
        mode: 'report',
        query: 'nonexistent topic',
      });

      expect(preview.sources).toHaveLength(0);
      expect(preview.outline).toContain('No sources found');
    });
  });

  // ---------- generate() dispatcher ----------

  describe('generate', () => {
    it('dispatches to generateReport for report mode', async () => {
      const results = [makeResult('eng_1'), makeResult('eng_2')];
      mockHybrid.mockResolvedValueOnce(results);
      mockCallLlm.mockResolvedValueOnce('# Report\n\nContent [eng_1].');

      const result = await service.generate({
        mode: 'report',
        query: 'test topic',
      });

      expect(result.document?.mode).toBe('report');
    });

    it('dispatches to generateSummary for summary mode', async () => {
      mockHybrid.mockResolvedValueOnce([]);

      const result = await service.generate({
        mode: 'summary',
        dateRange: { from: '2026-04-01', to: '2026-04-07' },
      });

      expect(result.document?.mode).toBe('summary');
    });

    it('dispatches to generateTimeline for timeline mode', async () => {
      mockHybrid.mockResolvedValueOnce([]);

      const result = await service.generate({
        mode: 'timeline',
      });

      expect(result.document).toBeNull();
    });
  });
});
