import { describe, expect, it, vi } from 'vitest';

import { parseResult } from './test-helpers.js';

import type { RetrievalResult } from '../../retrieval/types.js';

// Mock the DB and HybridSearchService
vi.mock('../../../../db.js', () => ({
  getDrizzle: () => ({}),
}));

// Silence logger; mapServiceError logs the raw error server-side now.
vi.mock('../../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockHybridResults: RetrievalResult[] = [
  {
    sourceType: 'engram',
    sourceId: 'eng_20260101_0900_finance-note',
    title: 'Finance planning for Q1',
    contentPreview: 'This is a note about Q1 finance planning with detailed budget allocations.',
    score: 0.92,
    matchType: 'both',
    metadata: { scopes: ['personal.finance'] },
  },
  {
    sourceType: 'engram',
    sourceId: 'eng_20260102_1000_meeting-notes',
    title: 'Meeting notes from Jan 2',
    contentPreview: 'A'.repeat(300),
    score: 0.85,
    matchType: 'semantic',
    metadata: { scopes: ['work.projects'] },
  },
];

const mockHybrid = vi.fn().mockResolvedValue(mockHybridResults);

vi.mock('../../retrieval/hybrid-search.js', () => ({
  HybridSearchService: class MockHybridSearchService {
    hybrid = mockHybrid;
  },
}));

const { handleCerebrumSearch } = await import('../search.js');

describe('handleCerebrumSearch', () => {
  it('returns VALIDATION_ERROR for empty query', async () => {
    const result = await handleCerebrumSearch({ query: '   ' });
    const parsed = parseResult(result);
    expect(parsed).toEqual({
      error: 'query is required and must be non-empty',
      code: 'VALIDATION_ERROR',
    });
    expect(result.isError).toBe(true);
  });

  it('returns VALIDATION_ERROR for missing query', async () => {
    const result = await handleCerebrumSearch({});
    expect(result.isError).toBe(true);
  });

  it('returns mapped results with id, title, score, scopes, snippet', async () => {
    const result = await handleCerebrumSearch({ query: 'finance planning' });
    const parsed = parseResult(result) as { results: Array<{ id: string; snippet: string }> };
    expect(parsed.results).toHaveLength(2);

    const first = parsed.results[0];
    expect(first?.id).toBe('eng_20260101_0900_finance-note');
    expect(first?.snippet).toContain('Q1 finance planning');
  });

  it('truncates snippets longer than 200 characters', async () => {
    const result = await handleCerebrumSearch({ query: 'meeting' });
    const parsed = parseResult(result) as { results: Array<{ snippet: string }> };
    const second = parsed.results[1];
    expect(second?.snippet.length).toBeLessThanOrEqual(201); // 200 + ellipsis char
    expect(second?.snippet).toContain('…');
  });

  it('passes scopes and limit to the search service', async () => {
    mockHybrid.mockClear();
    await handleCerebrumSearch({
      query: 'test',
      scopes: ['personal.finance'],
      limit: 5,
    });

    expect(mockHybrid).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ scopes: ['personal.finance'] }),
      5,
      0.8
    );
  });

  it('sets includeSecret when scopes contain a secret scope', async () => {
    mockHybrid.mockClear();
    await handleCerebrumSearch({
      query: 'secrets',
      scopes: ['personal.secret.passwords'],
    });

    expect(mockHybrid).toHaveBeenCalledWith(
      'secrets',
      expect.objectContaining({ includeSecret: true }),
      20,
      0.8
    );
  });

  it('does not set includeSecret for non-secret scopes', async () => {
    mockHybrid.mockClear();
    await handleCerebrumSearch({
      query: 'normal',
      scopes: ['personal.finance'],
    });

    expect(mockHybrid).toHaveBeenCalledWith(
      'normal',
      expect.objectContaining({ includeSecret: false }),
      20,
      0.8
    );
  });

  it('handles search service errors gracefully without leaking the raw message', async () => {
    mockHybrid.mockRejectedValueOnce(new Error('DB connection failed'));
    const result = await handleCerebrumSearch({ query: 'test' });
    const parsed = parseResult(result) as { error: string; code: string };
    expect(parsed.code).toBe('INTERNAL_ERROR');
    // Raw exception messages must not be surfaced to tool consumers.
    expect(parsed.error).not.toContain('DB connection failed');
    expect(parsed.error).toBe('An unexpected internal error occurred');
    expect(result.isError).toBe(true);
  });
});
