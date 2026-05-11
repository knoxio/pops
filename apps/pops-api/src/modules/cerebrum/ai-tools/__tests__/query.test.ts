import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extractText, parseResult } from './test-helpers.js';

const mockAsk = vi.fn();

vi.mock('../../query/query-service.js', () => ({
  QueryService: class MockQueryService {
    ask = mockAsk;
  },
}));

// Silence logger; mapServiceError logs unexpected errors server-side.
vi.mock('../../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Import after mock setup.
const { handleCerebrumQuery } = await import('../query.js');

describe('cerebrum.query MCP tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty question', async () => {
    const result = await handleCerebrumQuery({ question: '' });
    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain('question is required');
  });

  it('rejects whitespace-only question', async () => {
    const result = await handleCerebrumQuery({ question: '   ' });
    expect(result.isError).toBe(true);
    expect(extractText(result)).toContain('question is required');
  });

  it('rejects missing question', async () => {
    const result = await handleCerebrumQuery({});
    expect(result.isError).toBe(true);
  });

  it('returns answer and citations on success', async () => {
    mockAsk.mockResolvedValue({
      answer: 'The project started in January.',
      sources: [
        { id: 'eng_20260101_0900_project', title: 'Project Kickoff', relevance: 0.95 },
        { id: 'eng_20260115_1200_status', title: 'Status Update', relevance: 0.82 },
      ],
      scopes: ['work.projects'],
      confidence: 'high',
    });

    const result = await handleCerebrumQuery({ question: 'When did the project start?' });
    expect(result.isError).toBeUndefined();

    const parsed = parseResult(result) as {
      answer: string;
      citations: Array<{ id: string; title: string; relevance: number }>;
    };
    expect(parsed.answer).toBe('The project started in January.');
    expect(parsed.citations).toHaveLength(2);
    expect(parsed.citations[0]).toEqual({
      id: 'eng_20260101_0900_project',
      title: 'Project Kickoff',
      relevance: 0.95,
    });
  });

  it('passes scopes to the query service', async () => {
    mockAsk.mockResolvedValue({
      answer: 'No info.',
      sources: [],
      scopes: ['personal.health'],
      confidence: 'low',
    });

    await handleCerebrumQuery({
      question: 'How is my health?',
      scopes: ['personal.health'],
    });

    expect(mockAsk).toHaveBeenCalledWith(expect.objectContaining({ scopes: ['personal.health'] }));
  });

  it('limits maxSources to 3 for MCP latency', async () => {
    mockAsk.mockResolvedValue({
      answer: 'Answer',
      sources: [],
      scopes: [],
      confidence: 'low',
    });

    await handleCerebrumQuery({ question: 'test' });

    expect(mockAsk).toHaveBeenCalledWith(expect.objectContaining({ maxSources: 3 }));
  });

  it('handles service errors gracefully without leaking the raw message', async () => {
    mockAsk.mockRejectedValue(new Error('LLM unavailable'));

    const result = await handleCerebrumQuery({ question: 'test' });
    expect(result.isError).toBe(true);
    const text = extractText(result);
    // Raw exception messages must not be surfaced to tool consumers.
    expect(text).not.toContain('LLM unavailable');
    expect(text).toContain('An unexpected internal error occurred');
    const parsed = parseResult(result) as { code: string };
    expect(parsed.code).toBe('INTERNAL_ERROR');
  });

  it('filters invalid domain values', async () => {
    mockAsk.mockResolvedValue({
      answer: 'Answer',
      sources: [],
      scopes: [],
      confidence: 'low',
    });

    await handleCerebrumQuery({
      question: 'test',
      domains: ['engrams', 'invalid', 'media'],
    });

    expect(mockAsk).toHaveBeenCalledWith(
      expect.objectContaining({ domains: ['engrams', 'media'] })
    );
  });
});
