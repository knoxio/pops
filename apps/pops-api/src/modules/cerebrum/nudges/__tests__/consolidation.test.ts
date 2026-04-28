import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RetrievalResult } from '../../retrieval/types.js';
import type { EngramSummary, NudgeThresholds } from '../types.js';

vi.mock('../../../../lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const { ConsolidationDetector } = await import('../detectors/consolidation.js');

function makeEngram(id: string, overrides: Partial<EngramSummary> = {}): EngramSummary {
  return {
    id,
    type: overrides.type ?? 'note',
    title: overrides.title ?? `Engram ${id}`,
    scopes: overrides.scopes ?? ['work.projects'],
    tags: overrides.tags ?? [],
    status: overrides.status ?? 'active',
    createdAt: overrides.createdAt ?? '2026-03-01T10:00:00Z',
    modifiedAt: overrides.modifiedAt ?? '2026-03-15T10:00:00Z',
  };
}

function makeSimilarResult(sourceId: string, score: number): RetrievalResult {
  return {
    sourceType: 'engram',
    sourceId,
    title: `Engram ${sourceId}`,
    contentPreview: `Content for ${sourceId}`,
    score,
    matchType: 'semantic',
    metadata: { scopes: ['work.projects'] },
  };
}

function defaultThresholds(overrides: Partial<NudgeThresholds> = {}): NudgeThresholds {
  return {
    consolidationSimilarity: 0.85,
    consolidationMinCluster: 3,
    stalenessDays: 90,
    patternMinOccurrences: 5,
    maxPendingNudges: 20,
    nudgeCooldownHours: 24,
    ...overrides,
  };
}

describe('ConsolidationDetector', () => {
  const mockSimilar = vi.fn<() => Promise<RetrievalResult[]>>();

  const mockSearchService = {
    similar: mockSimilar,
    hybrid: vi.fn(),
    semanticSearch: vi.fn(),
    structuredOnly: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects a cluster of 3+ similar engrams', async () => {
    const engrams = [
      makeEngram('eng_1'),
      makeEngram('eng_2'),
      makeEngram('eng_3'),
      makeEngram('eng_4'),
    ];

    // eng_1 finds eng_2, eng_3 as similar
    mockSimilar.mockResolvedValueOnce([
      makeSimilarResult('eng_2', 0.92),
      makeSimilarResult('eng_3', 0.88),
    ]);
    // eng_4 is searched individually (not in cluster of eng_1)
    mockSimilar.mockResolvedValueOnce([]);

    const detector = new ConsolidationDetector(mockSearchService as never, defaultThresholds());
    const result = await detector.detect(engrams);

    expect(result.nudges).toHaveLength(1);
    expect(result.nudges[0]?.type).toBe('consolidation');
    expect(result.nudges[0]?.engramIds).toContain('eng_1');
    expect(result.nudges[0]?.engramIds).toContain('eng_2');
    expect(result.nudges[0]?.engramIds).toContain('eng_3');
    expect(result.nudges[0]?.action?.type).toBe('consolidate');
  });

  it('does not create a nudge for clusters below minimum size', async () => {
    const engrams = [makeEngram('eng_1'), makeEngram('eng_2'), makeEngram('eng_3')];

    // eng_1 finds only eng_2 (cluster size 2, below default 3)
    mockSimilar.mockResolvedValueOnce([makeSimilarResult('eng_2', 0.9)]);
    mockSimilar.mockResolvedValueOnce([]);

    const detector = new ConsolidationDetector(mockSearchService as never, defaultThresholds());
    const result = await detector.detect(engrams);

    expect(result.nudges).toHaveLength(0);
  });

  it('does not cluster engrams from different top-level scopes', async () => {
    const engrams = [
      makeEngram('eng_1', { scopes: ['work.projects'] }),
      makeEngram('eng_2', { scopes: ['personal.journal'] }),
      makeEngram('eng_3', { scopes: ['personal.notes'] }),
      makeEngram('eng_4', { scopes: ['work.meetings'] }),
    ];

    // eng_1 finds eng_2 and eng_3 as semantically similar, but eng_2/eng_3 are personal
    mockSimilar.mockResolvedValueOnce([
      makeSimilarResult('eng_2', 0.95),
      makeSimilarResult('eng_3', 0.9),
      makeSimilarResult('eng_4', 0.87),
    ]);
    // eng_2 finds eng_3 (same scope), but eng_1 is excluded (different scope)
    mockSimilar.mockResolvedValueOnce([makeSimilarResult('eng_3', 0.92)]);
    mockSimilar.mockResolvedValueOnce([]);

    const detector = new ConsolidationDetector(mockSearchService as never, defaultThresholds());
    const result = await detector.detect(engrams);

    // eng_1+eng_4 is only 2 (below min 3); eng_2+eng_3 is only 2
    expect(result.nudges).toHaveLength(0);
  });

  it('excludes archived and consolidated engrams', async () => {
    const engrams = [
      makeEngram('eng_1'),
      makeEngram('eng_2', { status: 'archived' }),
      makeEngram('eng_3'),
      makeEngram('eng_4'),
    ];

    // eng_2 is archived, should not appear in results even if semantically similar
    mockSimilar.mockResolvedValueOnce([
      makeSimilarResult('eng_2', 0.95),
      makeSimilarResult('eng_3', 0.88),
      makeSimilarResult('eng_4', 0.87),
    ]);

    const detector = new ConsolidationDetector(mockSearchService as never, defaultThresholds());
    const result = await detector.detect(engrams);

    expect(result.nudges).toHaveLength(1);
    // eng_2 excluded because archived
    expect(result.nudges[0]?.engramIds).not.toContain('eng_2');
    expect(result.nudges[0]?.engramIds).toHaveLength(3);
  });

  it('returns empty for fewer engrams than minimum cluster size', async () => {
    const engrams = [makeEngram('eng_1'), makeEngram('eng_2')];

    const detector = new ConsolidationDetector(mockSearchService as never, defaultThresholds());
    const result = await detector.detect(engrams);

    expect(result.nudges).toHaveLength(0);
    expect(mockSimilar).not.toHaveBeenCalled();
  });

  it('respects custom similarity threshold', async () => {
    const engrams = [
      makeEngram('eng_1'),
      makeEngram('eng_2'),
      makeEngram('eng_3'),
      makeEngram('eng_4'),
    ];

    // With threshold 0.95, the 0.88 result should still be included if
    // the search service returns it (threshold is passed to the search service).
    mockSimilar.mockResolvedValueOnce([
      makeSimilarResult('eng_2', 0.96),
      makeSimilarResult('eng_3', 0.97),
    ]);
    mockSimilar.mockResolvedValueOnce([]);

    const detector = new ConsolidationDetector(
      mockSearchService as never,
      defaultThresholds({ consolidationSimilarity: 0.95 })
    );
    const result = await detector.detect(engrams);

    expect(result.nudges).toHaveLength(1);
    // Should pass threshold 0.95 to the search service
    expect(mockSimilar).toHaveBeenCalledWith('eng_1', {}, 50, 0.95);
  });

  it('handles search service errors gracefully', async () => {
    const engrams = [makeEngram('eng_1'), makeEngram('eng_2'), makeEngram('eng_3')];

    mockSimilar.mockRejectedValueOnce(new Error('Vector search unavailable'));
    mockSimilar.mockRejectedValueOnce(new Error('Vector search unavailable'));
    mockSimilar.mockRejectedValueOnce(new Error('Vector search unavailable'));

    const detector = new ConsolidationDetector(mockSearchService as never, defaultThresholds());
    const result = await detector.detect(engrams);

    // Errors are logged but don't crash the detector.
    expect(result.nudges).toHaveLength(0);
  });

  it('includes correct action params in nudge', async () => {
    const engrams = [makeEngram('eng_1'), makeEngram('eng_2'), makeEngram('eng_3')];

    mockSimilar.mockResolvedValueOnce([
      makeSimilarResult('eng_2', 0.9),
      makeSimilarResult('eng_3', 0.88),
    ]);

    const detector = new ConsolidationDetector(mockSearchService as never, defaultThresholds());
    const result = await detector.detect(engrams);

    expect(result.nudges).toHaveLength(1);
    const nudge = result.nudges[0];
    expect(nudge?.action).toEqual({
      type: 'consolidate',
      label: 'Merge these 3 engrams',
      params: { engramIds: expect.arrayContaining(['eng_1', 'eng_2', 'eng_3']) },
    });
  });
});
