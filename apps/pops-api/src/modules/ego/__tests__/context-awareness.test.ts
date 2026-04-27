/**
 * Tests for Ego context awareness (PRD-087 US-03).
 *
 * Covers:
 * - System prompt includes human-readable app context description
 * - Viewed engram auto-loaded into context with score 1.0
 * - Scope biasing adds app-relevant scopes to retrieval
 * - Context state endpoint returns correct data
 * - App context update when it changes between turns
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDb } from '../../../shared/test-utils.js';
import { buildEgoSystemPrompt, formatAppContextDescription } from '../prompts.js';

import type { Database } from 'better-sqlite3';

import type { RetrievalResult } from '../../cerebrum/retrieval/types.js';
import type { ChatParams } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks (must precede dynamic imports)
// ---------------------------------------------------------------------------

const mockHybrid =
  vi.fn<
    (
      query: string,
      filters: Record<string, unknown>,
      limit: number,
      threshold: number
    ) => Promise<RetrievalResult[]>
  >();

vi.mock('../../../db.js', () => ({
  getDrizzle: () => ({}),
}));

vi.mock('../../cerebrum/retrieval/hybrid-search.js', () => ({
  HybridSearchService: class {
    hybrid = mockHybrid;
  },
}));

const mockEngramRead = vi.fn();

vi.mock('../../cerebrum/instance.js', () => ({
  getEngramService: () => ({
    read: mockEngramRead,
  }),
}));

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
    constructor() {
      this.messages = { create: mockCreate };
    }
  },
}));

vi.mock('../../../env.js', () => ({
  getEnv: (name: string) => {
    if (name === 'ANTHROPIC_API_KEY') return 'test-key';
    return undefined;
  },
}));

vi.mock('../../../lib/inference-middleware.js', () => ({
  trackInference: (_params: unknown, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../../../lib/ai-retry.js', () => ({
  withRateLimitRetry: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks.
const { ConversationEngine } = await import('../engine.js');
const { ConversationPersistence } = await import('../persistence.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLlmResponse(text: string, tokensIn = 100, tokensOut = 50) {
  return {
    content: [{ type: 'text' as const, text }],
    usage: { input_tokens: tokensIn, output_tokens: tokensOut },
  };
}

function defaultChatParams(overrides?: Partial<ChatParams>): ChatParams {
  return {
    conversationId: 'conv_test_001',
    message: 'What do I know about this?',
    history: [],
    activeScopes: ['work.projects'],
    ...overrides,
  };
}

function getHybridFilters(): Record<string, unknown> {
  const call = mockHybrid.mock.calls[0];
  return (call?.[1] ?? {}) as Record<string, unknown>;
}

function makeClock(start = new Date('2026-04-27T10:00:00Z')): () => Date {
  let t = start.getTime();
  return () => {
    const d = new Date(t);
    t += 1_000;
    return d;
  };
}

// ---------------------------------------------------------------------------
// Tests: formatAppContextDescription (pure function)
// ---------------------------------------------------------------------------

describe('formatAppContextDescription', () => {
  it('describes viewing an engram in Cerebrum', () => {
    const result = formatAppContextDescription({
      app: 'cerebrum',
      entityType: 'engram',
      entityId: 'eng_20260427_1500_test',
    });
    expect(result).toBe('The user is viewing engram eng_20260427_1500_test in Cerebrum');
  });

  it('describes viewing a transaction in finance', () => {
    const result = formatAppContextDescription({
      app: 'finance',
      entityType: 'transaction',
      entityId: 'txn_1234',
    });
    expect(result).toBe('The user is looking at transaction #txn_1234 in the finance app');
  });

  it('describes viewing a movie in media', () => {
    const result = formatAppContextDescription({
      app: 'media',
      entityType: 'movie',
      entityId: '42',
    });
    expect(result).toBe('The user is looking at movie #42 in the media app');
  });

  it('describes a route without entity', () => {
    const result = formatAppContextDescription({
      app: 'media',
      route: '/watchlist',
    });
    expect(result).toBe('The user is currently on /watchlist in the media app');
  });

  it('describes just the app when no route or entity', () => {
    const result = formatAppContextDescription({ app: 'inventory' });
    expect(result).toBe('The user is currently in the inventory app');
  });

  it('handles unknown app names gracefully', () => {
    const result = formatAppContextDescription({ app: 'custom-app' });
    expect(result).toBe('The user is currently in the custom-app app');
  });

  it('handles unknown entity types gracefully', () => {
    const result = formatAppContextDescription({
      app: 'finance',
      entityType: 'budget',
      entityId: 'bgt_001',
    });
    expect(result).toBe('The user is looking at budget #bgt_001 in the finance app');
  });
});

// ---------------------------------------------------------------------------
// Tests: buildEgoSystemPrompt with app context
// ---------------------------------------------------------------------------

describe('buildEgoSystemPrompt with app context', () => {
  it('includes app context description in the system prompt', () => {
    const prompt = buildEgoSystemPrompt(['personal.finance'], {
      app: 'finance',
      route: '/transactions',
      entityType: 'transaction',
      entityId: 'txn_123',
    });

    expect(prompt).toContain('The user is looking at transaction #txn_123 in the finance app');
    expect(prompt).toContain('personal.finance');
  });

  it('omits context line when no app context provided', () => {
    const prompt = buildEgoSystemPrompt(['work.projects']);
    expect(prompt).not.toContain('The user is');
    expect(prompt).toContain('work.projects');
  });

  it('includes engram context for Cerebrum', () => {
    const prompt = buildEgoSystemPrompt([], {
      app: 'cerebrum',
      entityType: 'engram',
      entityId: 'eng_20260427_1500_test',
    });
    expect(prompt).toContain('The user is viewing engram eng_20260427_1500_test in Cerebrum');
  });
});

// ---------------------------------------------------------------------------
// Tests: ConversationEngine — engram auto-loading
// ---------------------------------------------------------------------------

describe('ConversationEngine — engram auto-loading', () => {
  let engine: InstanceType<typeof ConversationEngine>;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new ConversationEngine();
  });

  it('auto-loads viewed engram with score 1.0 when viewing an engram', async () => {
    mockHybrid.mockResolvedValue([]);
    mockEngramRead.mockReturnValue({
      engram: {
        id: 'eng_20260427_1500_test',
        title: 'Test Engram',
        type: 'note',
        scopes: ['personal.cerebrum'],
        tags: ['test'],
        created: '2026-04-27',
      },
      body: 'This is the engram body content.',
    });
    mockCreate.mockResolvedValue(makeLlmResponse('Response about the engram.'));

    const result = await engine.chat(
      defaultChatParams({
        appContext: {
          app: 'cerebrum',
          entityType: 'engram',
          entityId: 'eng_20260427_1500_test',
        },
      })
    );

    expect(mockEngramRead).toHaveBeenCalledWith('eng_20260427_1500_test');
    expect(result.retrievedEngrams).toContainEqual({
      engramId: 'eng_20260427_1500_test',
      relevanceScore: 1.0,
    });
    // Verify it's prepended (first in the list).
    expect(result.retrievedEngrams[0]?.engramId).toBe('eng_20260427_1500_test');
    expect(result.retrievedEngrams[0]?.relevanceScore).toBe(1.0);
  });

  it('does not auto-load when entityType is not engram', async () => {
    mockHybrid.mockResolvedValue([]);
    mockCreate.mockResolvedValue(makeLlmResponse('Response.'));

    await engine.chat(
      defaultChatParams({
        appContext: {
          app: 'finance',
          entityType: 'transaction',
          entityId: 'txn_123',
        },
      })
    );

    expect(mockEngramRead).not.toHaveBeenCalled();
  });

  it('does not auto-load when entityId is missing', async () => {
    mockHybrid.mockResolvedValue([]);
    mockCreate.mockResolvedValue(makeLlmResponse('Response.'));

    await engine.chat(
      defaultChatParams({
        appContext: {
          app: 'cerebrum',
          entityType: 'engram',
        },
      })
    );

    expect(mockEngramRead).not.toHaveBeenCalled();
  });

  it('continues gracefully when engram read fails', async () => {
    mockHybrid.mockResolvedValue([]);
    mockEngramRead.mockImplementation(() => {
      throw new Error('Engram not found');
    });
    mockCreate.mockResolvedValue(makeLlmResponse('Response without engram.'));

    const result = await engine.chat(
      defaultChatParams({
        appContext: {
          app: 'cerebrum',
          entityType: 'engram',
          entityId: 'eng_nonexistent',
        },
      })
    );

    // Should still produce a valid response without the engram.
    expect(result.response.content).toBe('Response without engram.');
    expect(result.retrievedEngrams).toHaveLength(0);
  });

  it('prepends auto-loaded engram before Thalamus results', async () => {
    const thalamusResult: RetrievalResult = {
      sourceType: 'engram',
      sourceId: 'eng_20260401_0000_other',
      title: 'Other Engram',
      contentPreview: 'Other content.',
      score: 0.75,
      matchType: 'semantic',
      metadata: {},
    };
    mockHybrid.mockResolvedValue([thalamusResult]);
    mockEngramRead.mockReturnValue({
      engram: {
        id: 'eng_20260427_1500_viewed',
        title: 'Viewed Engram',
        type: 'note',
        scopes: ['personal'],
        tags: [],
        created: '2026-04-27',
      },
      body: 'Viewed engram body.',
    });
    mockCreate.mockResolvedValue(makeLlmResponse('Combined response.'));

    const result = await engine.chat(
      defaultChatParams({
        appContext: {
          app: 'cerebrum',
          entityType: 'engram',
          entityId: 'eng_20260427_1500_viewed',
        },
      })
    );

    expect(result.retrievedEngrams).toHaveLength(2);
    expect(result.retrievedEngrams[0]?.engramId).toBe('eng_20260427_1500_viewed');
    expect(result.retrievedEngrams[0]?.relevanceScore).toBe(1.0);
    expect(result.retrievedEngrams[1]?.engramId).toBe('eng_20260401_0000_other');
    expect(result.retrievedEngrams[1]?.relevanceScore).toBe(0.75);
  });
});

// ---------------------------------------------------------------------------
// Tests: Scope biasing from app context
// ---------------------------------------------------------------------------

describe('ConversationEngine — scope biasing', () => {
  let engine: InstanceType<typeof ConversationEngine>;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new ConversationEngine();
  });

  it('adds personal.finance scope when app is finance', async () => {
    mockHybrid.mockResolvedValue([]);
    mockCreate.mockResolvedValue(makeLlmResponse('Response.'));

    await engine.chat(
      defaultChatParams({
        activeScopes: ['work.projects'],
        appContext: { app: 'finance' },
      })
    );

    const filters = getHybridFilters();
    const scopes = filters['scopes'] as string[];
    expect(scopes).toContain('work.projects');
    expect(scopes).toContain('personal.finance');
  });

  it('adds personal.media scope when app is media', async () => {
    mockHybrid.mockResolvedValue([]);
    mockCreate.mockResolvedValue(makeLlmResponse('Response.'));

    await engine.chat(
      defaultChatParams({
        activeScopes: [],
        appContext: { app: 'media' },
      })
    );

    const filters = getHybridFilters();
    const scopes = filters['scopes'] as string[];
    expect(scopes).toContain('personal.media');
  });

  it('adds personal.inventory scope when app is inventory', async () => {
    mockHybrid.mockResolvedValue([]);
    mockCreate.mockResolvedValue(makeLlmResponse('Response.'));

    await engine.chat(
      defaultChatParams({
        activeScopes: ['personal.journal'],
        appContext: { app: 'inventory' },
      })
    );

    const filters = getHybridFilters();
    const scopes = filters['scopes'] as string[];
    expect(scopes).toContain('personal.journal');
    expect(scopes).toContain('personal.inventory');
  });

  it('does not duplicate scope if already present', async () => {
    mockHybrid.mockResolvedValue([]);
    mockCreate.mockResolvedValue(makeLlmResponse('Response.'));

    await engine.chat(
      defaultChatParams({
        activeScopes: ['personal.finance'],
        appContext: { app: 'finance' },
      })
    );

    const filters = getHybridFilters();
    const scopes = filters['scopes'] as string[];
    const financeCount = scopes.filter((s: string) => s === 'personal.finance').length;
    expect(financeCount).toBe(1);
  });

  it('does not add scope for unknown app', async () => {
    mockHybrid.mockResolvedValue([]);
    mockCreate.mockResolvedValue(makeLlmResponse('Response.'));

    await engine.chat(
      defaultChatParams({
        activeScopes: ['work.projects'],
        appContext: { app: 'cerebrum' },
      })
    );

    const filters = getHybridFilters();
    const scopes = filters['scopes'] as string[];
    expect(scopes).toEqual(['work.projects']);
  });

  it('merges scope biasing additively — does not replace existing scopes', async () => {
    mockHybrid.mockResolvedValue([]);
    mockCreate.mockResolvedValue(makeLlmResponse('Response.'));

    await engine.chat(
      defaultChatParams({
        activeScopes: ['work.projects', 'personal.journal'],
        appContext: { app: 'finance' },
      })
    );

    const filters = getHybridFilters();
    const scopes = filters['scopes'] as string[];
    expect(scopes).toContain('work.projects');
    expect(scopes).toContain('personal.journal');
    expect(scopes).toContain('personal.finance');
  });
});

// ---------------------------------------------------------------------------
// Tests: Context state endpoint (ego.context.getActive)
// ---------------------------------------------------------------------------

describe('ConversationPersistence — context state', () => {
  let db: Database;
  let svc: InstanceType<typeof ConversationPersistence>;

  beforeEach(() => {
    db = createTestDb();
    svc = new ConversationPersistence({
      db: drizzle(db),
      now: makeClock(),
    });
  });

  it('getContextEntries returns all engram associations for a conversation', () => {
    const conv = svc.createConversation({ model: 'm' });
    svc.upsertContext(conv.id, 'eng_20260101_0000_alpha', 0.9);
    svc.upsertContext(conv.id, 'eng_20260102_0000_beta', 0.75);

    const entries = svc.getContextEntries(conv.id);

    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.engramId)).toContain('eng_20260101_0000_alpha');
    expect(entries.map((e) => e.engramId)).toContain('eng_20260102_0000_beta');

    const alpha = entries.find((e) => e.engramId === 'eng_20260101_0000_alpha');
    expect(alpha?.relevanceScore).toBe(0.9);
    expect(alpha?.loadedAt).toBeTruthy();
  });

  it('getContextEntries returns empty array when no entries exist', () => {
    const conv = svc.createConversation({ model: 'm' });
    const entries = svc.getContextEntries(conv.id);
    expect(entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: App context update between turns
// ---------------------------------------------------------------------------

describe('ConversationPersistence — updateAppContext', () => {
  let db: Database;
  let svc: InstanceType<typeof ConversationPersistence>;

  beforeEach(() => {
    db = createTestDb();
    svc = new ConversationPersistence({
      db: drizzle(db),
      now: makeClock(),
    });
  });

  it('updates app context on the conversation', () => {
    const conv = svc.createConversation({
      model: 'm',
      appContext: { app: 'finance', route: '/transactions' },
    });
    expect(conv.appContext).toEqual({ app: 'finance', route: '/transactions' });

    svc.updateAppContext(conv.id, { app: 'media', route: '/watchlist' });

    const refreshed = svc.getConversation(conv.id);
    expect(refreshed!.conversation.appContext).toEqual({ app: 'media', route: '/watchlist' });
    expect(refreshed!.conversation.updatedAt).not.toBe(conv.updatedAt);
  });

  it('sets app context to null when passed null', () => {
    const conv = svc.createConversation({
      model: 'm',
      appContext: { app: 'finance' },
    });

    svc.updateAppContext(conv.id, null);

    const refreshed = svc.getConversation(conv.id);
    expect(refreshed!.conversation.appContext).toBeNull();
  });

  it('sets app context from null to a value', () => {
    const conv = svc.createConversation({ model: 'm' });
    expect(conv.appContext).toBeNull();

    svc.updateAppContext(conv.id, { app: 'inventory' });

    const refreshed = svc.getConversation(conv.id);
    expect(refreshed!.conversation.appContext).toEqual({ app: 'inventory' });
  });
});
