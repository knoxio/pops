import { describe, expect, it } from 'vitest';

import { toSourceCitations, extractDateRange } from '../helpers.js';
import { checkReportSources, buildReportDocument } from '../modes/report.js';
import {
  buildEmptySummary,
  capSummaryResults,
  sortByTypeImportance,
  buildSummaryDocument,
} from '../modes/summary.js';
import {
  sortChronologically,
  buildSingleEntryNotice,
  buildTimelineDocument,
} from '../modes/timeline.js';

import type { RetrievalResult } from '../../retrieval/types.js';

/** Helper that properly handles metadata merging. */
function makeResult(
  sourceId: string,
  metadata: Record<string, unknown> = {},
  overrides: Partial<Omit<RetrievalResult, 'metadata'>> = {}
): RetrievalResult {
  return {
    sourceType: 'engram',
    sourceId,
    title: `Engram ${sourceId}`,
    contentPreview: `Content for ${sourceId}`,
    score: 0.8,
    matchType: 'semantic',
    metadata: {
      scopes: ['work.projects'],
      createdAt: '2026-04-15T10:00:00Z',
      type: 'note',
      ...metadata,
    },
    ...overrides,
  };
}

// ---------- Report mode ----------

describe('checkReportSources', () => {
  it('returns null (no issue) when >= 2 sources exist', () => {
    const results = [makeResult('eng_1'), makeResult('eng_2')];
    expect(checkReportSources(results)).toBeNull();
  });

  it('returns notice for zero results', () => {
    const result = checkReportSources([]);
    expect(result).not.toBeNull();
    expect(result?.document).toBeNull();
    expect(result?.notice).toBe('No relevant engrams found for this query');
  });

  it('returns notice for insufficient sources (1 result)', () => {
    const result = checkReportSources([makeResult('eng_1')]);
    expect(result).not.toBeNull();
    expect(result?.document).toBeNull();
    expect(result?.notice).toBe('Insufficient data to generate a meaningful report');
  });
});

describe('buildReportDocument', () => {
  it('extracts title from LLM output H1', () => {
    const llmOutput = '# Agent Coordination Report\n\nIntroduction here.';
    const sources = toSourceCitations([makeResult('eng_1'), makeResult('eng_2')]);
    const doc = buildReportDocument(llmOutput, sources, 'work.*', [
      makeResult('eng_1'),
      makeResult('eng_2'),
    ]);

    expect(doc.title).toBe('Agent Coordination Report');
    expect(doc.mode).toBe('report');
    expect(doc.audienceScope).toBe('work.*');
    expect(doc.sources).toHaveLength(2);
  });

  it('falls back to generic title when no H1 found', () => {
    const llmOutput = 'Some content without a heading.';
    const sources = toSourceCitations([makeResult('eng_1')]);
    const doc = buildReportDocument(llmOutput, sources, 'work.*', [makeResult('eng_1')]);

    expect(doc.title).toBe('Generated Report');
  });

  it('includes metadata with source count and scope coverage', () => {
    const results = [
      makeResult('eng_1', { scopes: ['work.projects'] }),
      makeResult('eng_2', { scopes: ['work.meetings'] }),
    ];
    const sources = toSourceCitations(results);
    const doc = buildReportDocument('# Title\nBody', sources, 'work.*', results);

    expect(doc.metadata.sourceCount).toBe(2);
    expect(doc.metadata.scopeCoverage).toContain('work.projects');
    expect(doc.metadata.scopeCoverage).toContain('work.meetings');
    expect(doc.metadata.mode).toBe('report');
  });
});

describe('toSourceCitations', () => {
  it('maps retrieval results to source citations', () => {
    const results = [makeResult('eng_1')];
    const citations = toSourceCitations(results);

    expect(citations).toHaveLength(1);
    expect(citations[0]?.id).toBe('eng_1');
    expect(citations[0]?.type).toBe('engram');
    expect(citations[0]?.title).toBe('Engram eng_1');
    expect(citations[0]?.relevance).toBe(0.8);
  });

  it('truncates long excerpts', () => {
    const longContent = 'a'.repeat(300);
    const results: RetrievalResult[] = [
      {
        sourceType: 'engram',
        sourceId: 'eng_1',
        title: 'Test',
        contentPreview: longContent,
        score: 0.8,
        matchType: 'semantic',
        metadata: { scopes: ['work'] },
      },
    ];
    const citations = toSourceCitations(results);
    expect(citations[0]!.excerpt.length).toBeLessThanOrEqual(203); // 200 + '...'
  });
});

// ---------- Summary mode ----------

describe('buildEmptySummary', () => {
  it('returns a document with empty-range notice', () => {
    const doc = buildEmptySummary({ from: '2026-04-01', to: '2026-04-07' }, 'work.*');

    expect(doc.mode).toBe('summary');
    expect(doc.sources).toHaveLength(0);
    expect(doc.body).toContain('No engrams found between 2026-04-01 and 2026-04-07');
    expect(doc.dateRange).toEqual({ from: '2026-04-01', to: '2026-04-07' });
    expect(doc.metadata.sourceCount).toBe(0);
  });
});

describe('capSummaryResults', () => {
  it('returns results unchanged when under the cap', () => {
    const results = [makeResult('eng_1'), makeResult('eng_2')];
    const { capped, truncated } = capSummaryResults(results);
    expect(capped).toHaveLength(2);
    expect(truncated).toBe(false);
  });

  it('caps results at 50 and marks as truncated', () => {
    const results = Array.from({ length: 60 }, (_, i) =>
      makeResult(`eng_${i}`, {}, { score: 60 - i })
    );
    const { capped, truncated } = capSummaryResults(results);
    expect(capped).toHaveLength(50);
    expect(truncated).toBe(true);
    // Should keep highest-scored items
    expect(capped[0]?.score).toBeGreaterThanOrEqual(capped[49]!.score);
  });
});

describe('extractDateRange', () => {
  it('computes range from createdAt metadata', () => {
    const results = [
      makeResult('eng_1', { createdAt: '2026-04-10T10:00:00Z' }),
      makeResult('eng_2', { createdAt: '2026-04-01T10:00:00Z' }),
      makeResult('eng_3', { createdAt: '2026-04-20T10:00:00Z' }),
    ];

    const range = extractDateRange(results);
    expect(range).toEqual({
      from: '2026-04-01T10:00:00Z',
      to: '2026-04-20T10:00:00Z',
    });
  });

  it('returns null when no dates available', () => {
    const results = [makeResult('eng_1', { createdAt: undefined })];
    expect(extractDateRange(results)).toBeNull();
  });
});

describe('sortByTypeImportance', () => {
  it('sorts by type importance descending (decisions first)', () => {
    const sources = [
      { id: '1', type: 'note', title: '', excerpt: '', relevance: 0.8, scope: '' },
      { id: '2', type: 'decision', title: '', excerpt: '', relevance: 0.8, scope: '' },
      { id: '3', type: 'meeting', title: '', excerpt: '', relevance: 0.8, scope: '' },
      { id: '4', type: 'research', title: '', excerpt: '', relevance: 0.8, scope: '' },
    ];

    const sorted = sortByTypeImportance(sources);
    expect(sorted.map((s) => s.type)).toEqual(['decision', 'research', 'meeting', 'note']);
  });
});

describe('buildSummaryDocument', () => {
  it('builds a summary with correct metadata', () => {
    const results = [
      makeResult('eng_1', { createdAt: '2026-04-01T10:00:00Z' }),
      makeResult('eng_2', { createdAt: '2026-04-07T10:00:00Z' }),
    ];
    const dateRange = { from: '2026-04-01', to: '2026-04-07' };

    const doc = buildSummaryDocument({
      llmOutput: '# Weekly Summary\n\nContent here.',
      results,
      dateRange,
      audienceScope: 'work.*',
      truncated: false,
    });

    expect(doc.title).toBe('Weekly Summary');
    expect(doc.mode).toBe('summary');
    expect(doc.audienceScope).toBe('work.*');
    expect(doc.sources).toHaveLength(2);
    expect(doc.metadata.truncated).toBe(false);
  });

  it('marks truncated when capped', () => {
    const doc = buildSummaryDocument({
      llmOutput: '# Summary\nTruncated content.',
      results: [makeResult('eng_1')],
      dateRange: { from: '2026-04-01', to: '2026-04-30' },
      audienceScope: 'all',
      truncated: true,
    });

    expect(doc.metadata.truncated).toBe(true);
  });
});

// ---------- Timeline mode ----------

describe('sortChronologically', () => {
  it('sorts results by createdAt date (oldest first)', () => {
    const results = [
      makeResult('eng_3', { createdAt: '2026-04-20T10:00:00Z' }),
      makeResult('eng_1', { createdAt: '2026-04-01T10:00:00Z' }),
      makeResult('eng_2', { createdAt: '2026-04-10T10:00:00Z' }),
    ];

    const sorted = sortChronologically(results);
    expect(sorted.map((r) => r.sourceId)).toEqual(['eng_1', 'eng_2', 'eng_3']);
  });

  it('handles missing dates (pushed to beginning)', () => {
    const results = [
      makeResult('eng_2', { createdAt: '2026-04-10T10:00:00Z' }),
      makeResult('eng_1', { createdAt: undefined }),
    ];

    const sorted = sortChronologically(results);
    expect(sorted[0]?.sourceId).toBe('eng_1'); // no date -> empty string -> sorts first
  });
});

describe('buildSingleEntryNotice', () => {
  it('returns a notice about single point in time', () => {
    const notice = buildSingleEntryNotice();
    expect(notice).toContain('single point in time');
  });
});

describe('buildTimelineDocument', () => {
  it('builds a timeline with correct structure', () => {
    const results = [
      makeResult('eng_1', { createdAt: '2026-01-15T10:00:00Z' }),
      makeResult('eng_2', { createdAt: '2026-06-20T10:00:00Z' }),
    ];

    const doc = buildTimelineDocument('# Decision Timeline\n\nEntries here.', results, 'work.*');

    expect(doc.title).toBe('Decision Timeline');
    expect(doc.mode).toBe('timeline');
    expect(doc.audienceScope).toBe('work.*');
    expect(doc.sources).toHaveLength(2);
    expect(doc.dateRange).toEqual({
      from: '2026-01-15T10:00:00Z',
      to: '2026-06-20T10:00:00Z',
    });
  });

  it('appends single-entry notice for single result', () => {
    const results = [makeResult('eng_1', { createdAt: '2026-04-15T10:00:00Z' })];

    const doc = buildTimelineDocument('# Timeline\nOne entry.', results, 'all');

    expect(doc.body).toContain('single point in time');
  });

  it('does not append notice for multiple results', () => {
    const results = [
      makeResult('eng_1', { createdAt: '2026-04-01T10:00:00Z' }),
      makeResult('eng_2', { createdAt: '2026-04-15T10:00:00Z' }),
    ];

    const doc = buildTimelineDocument('# Timeline\nEntries.', results, 'all');

    expect(doc.body).not.toContain('single point in time');
  });
});
