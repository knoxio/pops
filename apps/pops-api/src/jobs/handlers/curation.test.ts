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
const mockChangeType = vi.fn();
const mockClassify = vi.fn();
const mockExtract = vi.fn();
const mockInfer = vi.fn();
const mockListScopes = vi.fn();
const mockReconcile = vi.fn();

vi.mock('../../modules/cerebrum/instance.js', () => ({
  getEngramService: () => ({
    read: mockRead,
    update: mockUpdate,
    changeType: mockChangeType,
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

vi.mock('../../modules/cerebrum/engrams/scopes-router.js', () => ({
  listScopes: (...args: unknown[]) => mockListScopes(...args),
}));

vi.mock('../../modules/cerebrum/engrams/scope-reconciliation.js', () => ({
  createScopeReconciliationService: () => ({
    reconcile: mockReconcile,
  }),
}));

vi.mock('../../db/cerebrum-handle.js', () => ({
  getCerebrumDrizzle: () => ({}),
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

    mockListScopes.mockReturnValue([]);
    mockReconcile.mockReturnValue({ suggestions: [] });
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

  it('graduates a capture engram to its classified type via changeType (PRD-081 US-03 AC #6)', async () => {
    await processJob(makeJob({ type: 'classifyEngram', engramId: 'eng_20260427_1500_test' }));

    expect(mockChangeType).toHaveBeenCalledWith('eng_20260427_1500_test', 'idea');
  });

  it('does not call changeType when the classified type matches the current type', async () => {
    mockClassify.mockResolvedValue({
      type: 'capture',
      confidence: 0.3,
      template: null,
      suggestedTags: [],
    });

    await processJob(makeJob({ type: 'classifyEngram', engramId: 'eng_20260427_1500_test' }));

    expect(mockChangeType).not.toHaveBeenCalled();
  });

  it('throws for unknown job types', async () => {
    await expect(processJob(makeJob({ type: 'unknownType' }))).rejects.toThrow(
      'Curation handler not implemented'
    );
  });
});

describe('curation handler — scope reconciliation (PRD-081 US-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRead.mockReturnValue({
      engram: {
        id: 'eng_20260514_1700_test',
        title: 'Karbon meeting notes',
        type: 'capture',
        scopes: ['karbon.meetings'],
        tags: [],
        source: 'manual',
        created: '2026-05-14T17:00:00Z',
        contentHash: 'reconcile-hash',
        customFields: { _reconcile_scopes: true },
      },
      body: 'Met with Karbon team about meeting cadence',
    });

    mockClassify.mockResolvedValue({
      type: 'meeting',
      confidence: 0.92,
      template: 'meeting',
      suggestedTags: [],
    });

    mockExtract.mockResolvedValue({
      entities: [],
      tags: [],
      referencedDates: [],
    });

    mockListScopes.mockReturnValue([{ scope: 'work.karbon.fedx.meetings', count: 12 }]);
  });

  it('preserves user-suggested scopes and skips scope inference when _reconcile_scopes is true', async () => {
    await processJob(makeJob({ type: 'classifyEngram', engramId: 'eng_20260514_1700_test' }));

    expect(mockInfer).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      'eng_20260514_1700_test',
      expect.objectContaining({ scopes: ['karbon.meetings'] })
    );
  });

  it('runs reconciliation against listScopes and stores suggestions in customFields', async () => {
    mockReconcile.mockReturnValue({
      suggestions: [
        {
          original: 'karbon.meetings',
          canonical: 'work.karbon.fedx.meetings',
          confidence: 0.85,
          reason: 'matches longer canonical scope',
        },
      ],
    });

    await processJob(makeJob({ type: 'classifyEngram', engramId: 'eng_20260514_1700_test' }));

    expect(mockReconcile).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedScopes: ['karbon.meetings'],
        knownScopes: [{ scope: 'work.karbon.fedx.meetings', count: 12 }],
      })
    );
    const call = mockUpdate.mock.calls[0]?.[1] as Record<string, unknown>;
    const customFields = call?.['customFields'] as Record<string, unknown>;
    expect(customFields?.['_scope_suggestions']).toEqual([
      expect.objectContaining({
        original: 'karbon.meetings',
        canonical: 'work.karbon.fedx.meetings',
        confidence: 0.85,
      }),
    ]);
  });

  it('passes previously dismissed segment-set keys to the reconciliation service', async () => {
    mockRead.mockReturnValue({
      engram: {
        id: 'eng_20260514_1700_test',
        title: 'Karbon meeting notes',
        type: 'capture',
        scopes: ['karbon.meetings'],
        tags: [],
        source: 'manual',
        created: '2026-05-14T17:00:00Z',
        contentHash: 'reconcile-hash',
        customFields: {
          _reconcile_scopes: true,
          _scope_suggestions_dismissed: ['fedx|karbon|meetings|work'],
        },
      },
      body: 'Met with Karbon team about meeting cadence',
    });

    await processJob(makeJob({ type: 'classifyEngram', engramId: 'eng_20260514_1700_test' }));

    expect(mockReconcile).toHaveBeenCalledWith(
      expect.objectContaining({
        dismissedSegmentSetKeys: ['fedx|karbon|meetings|work'],
      })
    );
  });

  it('clears stale suggestions when reconciliation returns none', async () => {
    mockRead.mockReturnValue({
      engram: {
        id: 'eng_20260514_1700_test',
        title: 'Karbon meeting notes',
        type: 'capture',
        scopes: ['karbon.meetings'],
        tags: [],
        source: 'manual',
        created: '2026-05-14T17:00:00Z',
        contentHash: 'reconcile-hash',
        customFields: {
          _reconcile_scopes: true,
          _scope_suggestions: [{ original: 'old', canonical: 'old.canonical', confidence: 0.9 }],
        },
      },
      body: 'Met with Karbon team about meeting cadence',
    });
    mockReconcile.mockReturnValue({ suggestions: [] });

    await processJob(makeJob({ type: 'classifyEngram', engramId: 'eng_20260514_1700_test' }));

    const call = mockUpdate.mock.calls[0]?.[1] as Record<string, unknown>;
    const customFields = call?.['customFields'] as Record<string, unknown>;
    expect(customFields).not.toHaveProperty('_scope_suggestions');
  });

  it('clears stale _scope_suggestions when reconciliation is no longer active', async () => {
    // Engram had reconciliation suggestions on a previous run, but the opt-in
    // flag has since been cleared (e.g. user dropped to fallback inference).
    // Stale suggestions must not survive into the new enrichment record.
    mockRead.mockReturnValue({
      engram: {
        id: 'eng_20260514_1700_test',
        title: 'Karbon meeting notes',
        type: 'capture',
        scopes: ['personal.captures'],
        tags: [],
        source: 'cli',
        created: '2026-05-14T17:00:00Z',
        contentHash: 'reconcile-hash',
        customFields: {
          _scope_suggestions: [
            { original: 'old', canonical: 'old.canonical', confidence: 0.9, reason: 'stale' },
          ],
        },
      },
      body: 'Met with Karbon team about meeting cadence',
    });
    mockInfer.mockResolvedValue({
      scopes: ['work.karbon.fedx.meetings'],
      source: 'llm',
      confidence: 0.9,
    });

    await processJob(makeJob({ type: 'classifyEngram', engramId: 'eng_20260514_1700_test' }));

    const call = mockUpdate.mock.calls[0]?.[1] as Record<string, unknown>;
    const customFields = call?.['customFields'] as Record<string, unknown>;
    expect(customFields).not.toHaveProperty('_scope_suggestions');
  });

  it('falls back to scope inference when _reconcile_scopes is not set', async () => {
    mockRead.mockReturnValue({
      engram: {
        id: 'eng_20260514_1700_test',
        title: 'Karbon meeting notes',
        type: 'capture',
        scopes: ['personal.captures'],
        tags: [],
        source: 'cli',
        created: '2026-05-14T17:00:00Z',
        contentHash: 'reconcile-hash',
        customFields: {},
      },
      body: 'Met with Karbon team about meeting cadence',
    });
    mockInfer.mockResolvedValue({
      scopes: ['work.karbon.fedx.meetings'],
      source: 'llm',
      confidence: 0.9,
    });

    await processJob(makeJob({ type: 'classifyEngram', engramId: 'eng_20260514_1700_test' }));

    expect(mockInfer).toHaveBeenCalled();
    expect(mockReconcile).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      'eng_20260514_1700_test',
      expect.objectContaining({ scopes: ['work.karbon.fedx.meetings'] })
    );
  });
});
