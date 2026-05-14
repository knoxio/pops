/**
 * Tests for the cerebrum.ingest enrichmentStatus + retryEnrichment endpoints
 * (PRD-081 US-07).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRead = vi.fn();
const mockQueueAdd = vi.fn();
const mockGetQueue = vi.fn();

vi.mock('../instance.js', () => ({
  getEngramService: () => ({ read: mockRead }),
  getScopeRuleEngine: () => ({ getConfig: () => ({}), inferScopes: () => [] }),
}));

vi.mock('../../../jobs/queues.js', () => ({
  getCurationQueue: () => mockGetQueue(),
}));

const { ingestRouter } = await import('./router.js');
const { router: trpcRouter } = await import('../../../trpc.js');

const root = trpcRouter({ ingest: ingestRouter });
const caller = root.createCaller({
  user: { email: 'test@example.com' },
  serviceAccount: null,
} as Parameters<typeof root.createCaller>[0]);

describe('ingest router — enrichmentStatus (PRD-081 US-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports enriched=true when _enrichedHash matches the current contentHash', async () => {
    mockRead.mockReturnValue({
      engram: {
        id: 'eng_x',
        type: 'idea',
        template: 'idea',
        scopes: ['work.karbon.fedx.meetings'],
        tags: ['topic:routing'],
        contentHash: 'abc',
        customFields: { _enrichedHash: 'abc' },
      },
      body: 'body',
    });

    const result = await caller.ingest.enrichmentStatus({ engramId: 'eng_x' });
    expect(result).toEqual({
      enriched: true,
      type: 'idea',
      template: 'idea',
      scopes: ['work.karbon.fedx.meetings'],
      tags: ['topic:routing'],
      scopeSuggestions: [],
    });
  });

  it('reports enriched=false when _enrichedHash is absent', async () => {
    mockRead.mockReturnValue({
      engram: {
        id: 'eng_x',
        type: 'capture',
        template: undefined,
        scopes: ['personal.captures'],
        tags: [],
        contentHash: 'abc',
        customFields: {},
      },
      body: 'body',
    });

    const result = await caller.ingest.enrichmentStatus({ engramId: 'eng_x' });
    expect(result.enriched).toBe(false);
  });

  it('returns scope suggestions from _scope_suggestions when present', async () => {
    const suggestions = [
      {
        original: 'karbon.meetings',
        canonical: 'work.karbon.fedx.meetings',
        confidence: 0.85,
        reason: 'matches longer canonical scope',
      },
    ];
    mockRead.mockReturnValue({
      engram: {
        id: 'eng_x',
        type: 'capture',
        template: undefined,
        scopes: ['karbon.meetings'],
        tags: [],
        contentHash: 'abc',
        customFields: { _enrichedHash: 'abc', _scope_suggestions: suggestions },
      },
      body: 'body',
    });

    const result = await caller.ingest.enrichmentStatus({ engramId: 'eng_x' });
    expect(result.scopeSuggestions).toEqual(suggestions);
  });

  it('coerces non-array _scope_suggestions to empty array (defensive)', async () => {
    mockRead.mockReturnValue({
      engram: {
        id: 'eng_x',
        type: 'capture',
        template: undefined,
        scopes: ['x.y'],
        tags: [],
        contentHash: 'abc',
        customFields: { _scope_suggestions: 'corrupted-string' },
      },
      body: 'body',
    });

    const result = await caller.ingest.enrichmentStatus({ engramId: 'eng_x' });
    expect(result.scopeSuggestions).toEqual([]);
  });
});

describe('ingest router — retryEnrichment (PRD-081 US-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRead.mockReturnValue({
      engram: {
        id: 'eng_x',
        type: 'capture',
        scopes: [],
        tags: [],
        contentHash: 'abc',
        customFields: {},
      },
      body: 'body',
    });
    mockGetQueue.mockReturnValue({ add: mockQueueAdd });
    mockQueueAdd.mockResolvedValue(undefined);
  });

  it('re-enqueues classifyEngram and returns { requeued: true }', async () => {
    const result = await caller.ingest.retryEnrichment({ engramId: 'eng_x' });
    expect(mockQueueAdd).toHaveBeenCalledWith('classifyEngram', {
      type: 'classifyEngram',
      engramId: 'eng_x',
    });
    expect(result).toEqual({ engramId: 'eng_x', requeued: true });
  });

  it('throws SERVICE_UNAVAILABLE when the curation queue is not configured', async () => {
    mockGetQueue.mockReturnValue(null);
    await expect(caller.ingest.retryEnrichment({ engramId: 'eng_x' })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});
