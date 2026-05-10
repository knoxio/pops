/**
 * Tests for the curation queue handler — classifyEngram job processing.
 *
 * Verifies that the background enrichment job updates type, template, tags,
 * scopes, and referenced_dates, and is idempotent when content is unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Job } from 'bullmq';

const mockRead = vi.fn();
const mockUpdate = vi.fn();
const mockClassify = vi.fn();
const mockExtract = vi.fn();
const mockInfer = vi.fn();

vi.mock('../../modules/cerebrum/instance.js', () => ({
  getEngramService: () => ({
    read: mockRead,
    update: mockUpdate,
  }),
  getScopeRuleEngine: () => ({
    getConfig: () => ({}),
  }),
}));

vi.mock('../../modules/cerebrum/ingest/classifier.js', () => ({
  CortexClassifier: class {
    classify = mockClassify;
  },
}));

vi.mock('../../modules/cerebrum/ingest/entity-extractor.js', () => ({
  CortexEntityExtractor: class {
    extract = mockExtract;
  },
}));

vi.mock('../../modules/cerebrum/ingest/scope-inference.js', () => ({
  createScopeInferenceService: () => ({
    infer: mockInfer,
  }),
}));

const { process: processJob } = await import('./curation.js');

function makeJob(data: Record<string, unknown>): Job {
  return { id: 'test-job-1', data } as unknown as Job;
}

describe('curation handler — classifyEngram', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRead.mockReturnValue({
      engram: {
        id: 'eng_20260427_1500_test',
        title: 'Test capture',
        type: 'capture',
        scopes: ['personal.captures'],
        tags: [],
        source: 'cli',
        created: '2026-04-27T15:00:00Z',
        contentHash: 'abc123',
        customFields: {},
      },
      body: 'Had a great idea about agent routing using LangGraph',
    });

    mockClassify.mockResolvedValue({
      type: 'idea',
      confidence: 0.9,
      template: 'idea',
      suggestedTags: ['topic:agent-routing'],
    });

    mockExtract.mockResolvedValue({
      entities: [
        { type: 'topic', value: 'LangGraph', normalised: 'langgraph', confidence: 0.85 },
        { type: 'date', value: 'April 27', normalised: '2026-04-27', confidence: 0.8 },
      ],
      tags: ['topic:langgraph', 'date:2026-04-27'],
      referencedDates: ['2026-04-27'],
    });

    mockInfer.mockResolvedValue({
      scopes: ['personal.ideas'],
      source: 'rules',
      confidence: 0.8,
    });
  });

  it('updates scopes, tags, and customFields with referenced_dates', async () => {
    await processJob(makeJob({ type: 'classifyEngram', engramId: 'eng_20260427_1500_test' }));

    expect(mockUpdate).toHaveBeenCalledWith(
      'eng_20260427_1500_test',
      expect.objectContaining({
        scopes: ['personal.ideas'],
        tags: expect.arrayContaining(['topic:agent-routing', 'topic:langgraph']),
        customFields: expect.objectContaining({
          referenced_dates: ['2026-04-27'],
          _enrichedHash: 'abc123',
        }),
      })
    );
  });

  it('passes reference date from engram creation to entity extractor', async () => {
    await processJob(makeJob({ type: 'classifyEngram', engramId: 'eng_20260427_1500_test' }));

    expect(mockExtract).toHaveBeenCalledWith(expect.any(String), expect.any(Array), '2026-04-27');
  });

  it('is idempotent — skips enrichment when content hash matches', async () => {
    mockRead.mockReturnValue({
      engram: {
        id: 'eng_20260427_1500_test',
        title: 'Test',
        type: 'idea',
        scopes: ['personal.ideas'],
        tags: ['topic:langgraph'],
        source: 'cli',
        created: '2026-04-27T15:00:00Z',
        contentHash: 'abc123',
        customFields: { _enrichedHash: 'abc123' },
      },
      body: 'Same content',
    });

    await processJob(makeJob({ type: 'classifyEngram', engramId: 'eng_20260427_1500_test' }));

    expect(mockClassify).not.toHaveBeenCalled();
    expect(mockExtract).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('runs enrichment when content hash differs from previous enrichment', async () => {
    mockRead.mockReturnValue({
      engram: {
        id: 'eng_20260427_1500_test',
        title: 'Updated capture',
        type: 'capture',
        scopes: ['personal.captures'],
        tags: [],
        source: 'cli',
        created: '2026-04-27T15:00:00Z',
        contentHash: 'new-hash-456',
        customFields: { _enrichedHash: 'old-hash-123' },
      },
      body: 'Updated content with new ideas',
    });

    await processJob(makeJob({ type: 'classifyEngram', engramId: 'eng_20260427_1500_test' }));

    expect(mockClassify).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('omits referenced_dates from customFields when none extracted', async () => {
    mockExtract.mockResolvedValue({
      entities: [],
      tags: [],
      referencedDates: [],
    });

    await processJob(makeJob({ type: 'classifyEngram', engramId: 'eng_20260427_1500_test' }));

    const updateCall = mockUpdate.mock.calls[0];
    const customFields = (updateCall?.[1] as Record<string, unknown>)?.customFields as Record<
      string,
      unknown
    >;
    expect(customFields).not.toHaveProperty('referenced_dates');
    expect(customFields).toHaveProperty('_enrichedHash', 'abc123');
  });

  it('persists the classified template name on the engram', async () => {
    await processJob(makeJob({ type: 'classifyEngram', engramId: 'eng_20260427_1500_test' }));

    expect(mockUpdate).toHaveBeenCalledWith(
      'eng_20260427_1500_test',
      expect.objectContaining({ template: 'idea' })
    );
  });

  it('omits template when classification returns null', async () => {
    mockClassify.mockResolvedValue({
      type: 'capture',
      confidence: 0.4,
      template: null,
      suggestedTags: [],
    });

    await processJob(makeJob({ type: 'classifyEngram', engramId: 'eng_20260427_1500_test' }));

    const call = mockUpdate.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call).not.toHaveProperty('template');
  });

  it('throws for unknown job types', async () => {
    await expect(processJob(makeJob({ type: 'unknownType' }))).rejects.toThrow(
      'Curation handler not implemented'
    );
  });
});
