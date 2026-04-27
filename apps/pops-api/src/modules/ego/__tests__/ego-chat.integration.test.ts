/**
 * Integration tests for the Ego chat pipeline.
 *
 * Exercises the full request path with a real SQLite database, mocked LLM
 * calls, and mocked Thalamus retrieval. Covers:
 *
 *  - Conversation persistence: creation, message append, updatedAt bumps
 *  - Context storage: retrieved engrams saved to conversation_context
 *  - Citation parsing: references extracted from LLM output
 *  - Token tracking: input/output tokens recorded on assistant messages
 *  - Multi-turn history: messages accumulate across turns
 *  - Scope negotiation: keyword-driven scope changes persisted
 *  - Cascade deletion: conversation delete removes messages + context
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDb } from '../../../shared/test-utils.js';
import { ConversationPersistence } from '../persistence.js';
import { ConversationScopeNegotiator } from '../scope-negotiator.js';

import type { Database } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { RetrievalResult } from '../../cerebrum/retrieval/types.js';
import type { ChatParams, ChatResult, Message } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks — LLM, Thalamus, and supporting infra
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

vi.mock('../../../db.js', () => {
  let testDb: BetterSQLite3Database | null = null;
  return {
    getDrizzle: () => {
      if (!testDb) throw new Error('Test DB not initialised');
      return testDb;
    },
    /** Test-only: inject the test drizzle instance. */
    __setTestDrizzle: (db: BetterSQLite3Database) => {
      testDb = db;
    },
  };
});

vi.mock('../../cerebrum/retrieval/hybrid-search.js', () => ({
  HybridSearchService: class {
    hybrid = mockHybrid;
  },
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

// Dynamic import after mocks.
const { ConversationEngine } = await import('../engine.js');
const dbMod: Record<string, unknown> = await import('../../../db.js');
const setTestDrizzle = dbMod['__setTestDrizzle'] as (db: BetterSQLite3Database) => void;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fixed clock that advances one second per call. */
function makeClock(start = new Date('2026-04-27T10:00:00Z')): () => Date {
  let t = start.getTime();
  return () => {
    const d = new Date(t);
    t += 1_000;
    return d;
  };
}

function makeRetrievalResult(overrides?: Partial<RetrievalResult>): RetrievalResult {
  return {
    sourceType: 'engram',
    sourceId: 'eng_20260417_0942_agent-coordination',
    title: 'Agent Coordination',
    contentPreview: 'Notes about coordinating multiple AI agents.',
    score: 0.85,
    matchType: 'semantic',
    metadata: {
      type: 'research',
      scopes: ['work.projects'],
      tags: ['ai', 'agents'],
      createdAt: '2026-04-17',
    },
    ...overrides,
  };
}

function makeLlmResponse(text: string, tokensIn = 100, tokensOut = 50) {
  return {
    content: [{ type: 'text' as const, text }],
    usage: { input_tokens: tokensIn, output_tokens: tokensOut },
  };
}

/**
 * Run the full chat pipeline mimicking what the tRPC router does:
 * resolve/create conversation → engine.chat → persist results.
 */
async function runChatPipeline(
  persistence: ConversationPersistence,
  engine: InstanceType<typeof ConversationEngine>,
  opts: {
    conversationId?: string;
    message: string;
    scopes?: string[];
    channel?: 'shell' | 'moltbot' | 'mcp' | 'cli';
    knownScopes?: string[];
  }
): Promise<{
  conversationId: string;
  result: ChatResult;
  assistantMsg: Message;
}> {
  const scopes = opts.scopes ?? [];

  // Resolve or create conversation.
  let conv = opts.conversationId
    ? (persistence.getConversation(opts.conversationId)?.conversation ?? null)
    : null;

  if (!conv) {
    conv = persistence.createConversation({
      scopes,
      model: 'claude-sonnet-4-20250514',
    });
  }

  const historyResult = persistence.getConversation(conv.id);
  const history = historyResult?.messages ?? [];

  const chatParams: ChatParams = {
    conversationId: conv.id,
    message: opts.message,
    history,
    activeScopes: conv.activeScopes,
    channel: opts.channel ?? 'shell',
    knownScopes: opts.knownScopes,
  };

  const result = await engine.chat(chatParams);

  // Persist scope changes.
  if (result.scopeNegotiation?.changed) {
    persistence.updateScopes(conv.id, result.scopeNegotiation.scopes);
  }

  // Persist user message.
  persistence.appendMessage(conv.id, { role: 'user', content: opts.message });

  // Persist assistant message.
  const assistantMsg = persistence.appendMessage(conv.id, {
    role: 'assistant',
    content: result.response.content,
    citations: result.response.citations,
    tokensIn: result.response.tokensIn,
    tokensOut: result.response.tokensOut,
  });

  // Persist context engrams.
  for (const { engramId, relevanceScore } of result.retrievedEngrams) {
    persistence.upsertContext(conv.id, engramId, relevanceScore);
  }

  return { conversationId: conv.id, result, assistantMsg };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Ego chat pipeline (integration)', () => {
  let rawDb: Database;
  let drizzleDb: BetterSQLite3Database;
  let persistence: ConversationPersistence;
  let engine: InstanceType<typeof ConversationEngine>;

  beforeEach(() => {
    vi.clearAllMocks();

    rawDb = createTestDb();
    drizzleDb = drizzle(rawDb);
    setTestDrizzle(drizzleDb);

    persistence = new ConversationPersistence({
      db: drizzleDb,
      now: makeClock(),
    });

    engine = new ConversationEngine();
  });

  afterEach(() => {
    rawDb.close();
  });

  // -----------------------------------------------------------------------
  // Single-turn chat
  // -----------------------------------------------------------------------

  describe('single-turn chat', () => {
    it('persists user and assistant messages after a chat turn', async () => {
      mockHybrid.mockResolvedValue([makeRetrievalResult()]);
      mockCreate.mockResolvedValue(
        makeLlmResponse(
          'Based on your notes [eng_20260417_0942_agent-coordination], agent coordination is key.',
          200,
          80
        )
      );

      const { conversationId } = await runChatPipeline(persistence, engine, {
        message: 'What do I know about agent coordination?',
        scopes: ['work.projects'],
      });

      const loaded = persistence.getConversation(conversationId);
      expect(loaded).not.toBeNull();
      expect(loaded!.messages).toHaveLength(2);

      const userMsg = loaded!.messages[0]!;
      expect(userMsg.role).toBe('user');
      expect(userMsg.content).toBe('What do I know about agent coordination?');

      const assistantMsg = loaded!.messages[1]!;
      expect(assistantMsg.role).toBe('assistant');
      expect(assistantMsg.content).toContain('agent coordination');
    });

    it('updates conversation updatedAt after chat', async () => {
      mockHybrid.mockResolvedValue([]);
      mockCreate.mockResolvedValue(makeLlmResponse('No information found.'));

      const conv = persistence.createConversation({
        model: 'claude-sonnet-4-20250514',
        scopes: [],
      });
      const originalUpdatedAt = conv.updatedAt;

      await runChatPipeline(persistence, engine, {
        conversationId: conv.id,
        message: 'Hello',
      });

      const refreshed = persistence.getConversation(conv.id);
      expect(refreshed!.conversation.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('stores retrieved engrams in conversation_context', async () => {
      const engram1 = makeRetrievalResult({
        sourceId: 'eng_20260401_1000_budget-note',
        score: 0.92,
      });
      const engram2 = makeRetrievalResult({
        sourceId: 'eng_20260402_1100_tax-note',
        score: 0.78,
      });
      mockHybrid.mockResolvedValue([engram1, engram2]);
      mockCreate.mockResolvedValue(
        makeLlmResponse(
          'Based on [eng_20260401_1000_budget-note] and [eng_20260402_1100_tax-note], here is info.'
        )
      );

      const { conversationId } = await runChatPipeline(persistence, engine, {
        message: 'What are my finance notes?',
        scopes: ['personal.finance'],
      });

      const rows = rawDb
        .prepare('SELECT * FROM conversation_context WHERE conversation_id = ? ORDER BY engram_id')
        .all(conversationId) as Array<{
        engram_id: string;
        relevance_score: number;
      }>;

      expect(rows).toHaveLength(2);
      expect(rows[0]!.engram_id).toBe('eng_20260401_1000_budget-note');
      expect(rows[0]!.relevance_score).toBeCloseTo(0.92, 2);
      expect(rows[1]!.engram_id).toBe('eng_20260402_1100_tax-note');
      expect(rows[1]!.relevance_score).toBeCloseTo(0.78, 2);
    });

    it('parses citations from LLM output and stores on assistant message', async () => {
      mockHybrid.mockResolvedValue([
        makeRetrievalResult({ sourceId: 'eng_20260417_0942_agent-coordination' }),
      ]);
      mockCreate.mockResolvedValue(
        makeLlmResponse(
          'According to [eng_20260417_0942_agent-coordination], agents coordinate via message passing.'
        )
      );

      const { conversationId } = await runChatPipeline(persistence, engine, {
        message: 'How do agents coordinate?',
        scopes: ['work.projects'],
      });

      const loaded = persistence.getConversation(conversationId);
      const assistantMsg = loaded!.messages.find((m) => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg!.citations).toContain('eng_20260417_0942_agent-coordination');
    });

    it('records token counts on the assistant message', async () => {
      mockHybrid.mockResolvedValue([]);
      mockCreate.mockResolvedValue(makeLlmResponse('Token tracking test.', 350, 120));

      const { conversationId } = await runChatPipeline(persistence, engine, {
        message: 'Token test',
      });

      const loaded = persistence.getConversation(conversationId);
      const assistantMsg = loaded!.messages.find((m) => m.role === 'assistant');
      expect(assistantMsg!.tokensIn).toBe(350);
      expect(assistantMsg!.tokensOut).toBe(120);
    });
  });

  // -----------------------------------------------------------------------
  // Multi-turn chat
  // -----------------------------------------------------------------------

  describe('multi-turn chat', () => {
    it('accumulates messages across multiple turns', async () => {
      mockHybrid.mockResolvedValue([]);
      mockCreate.mockResolvedValue(makeLlmResponse('First response.'));

      const { conversationId } = await runChatPipeline(persistence, engine, {
        message: 'First question',
      });

      mockCreate.mockResolvedValue(makeLlmResponse('Second response.'));

      await runChatPipeline(persistence, engine, {
        conversationId,
        message: 'Follow-up question',
      });

      const loaded = persistence.getConversation(conversationId);
      expect(loaded!.messages).toHaveLength(4); // 2 user + 2 assistant
      expect(loaded!.messages.map((m) => m.role)).toEqual([
        'user',
        'assistant',
        'user',
        'assistant',
      ]);
    });

    it('auto-generates title from the first user message', async () => {
      mockHybrid.mockResolvedValue([]);
      mockCreate.mockResolvedValue(makeLlmResponse('Response'));

      const { conversationId } = await runChatPipeline(persistence, engine, {
        message: 'How do I set up a budget in POPS?',
      });

      const loaded = persistence.getConversation(conversationId);
      expect(loaded!.conversation.title).toBe('How do I set up a budget in POPS?');
    });

    it('merges context engrams from multiple turns without duplicates', async () => {
      const engram1 = makeRetrievalResult({
        sourceId: 'eng_20260401_1000_note-a',
        score: 0.9,
      });
      const engram2 = makeRetrievalResult({
        sourceId: 'eng_20260402_1100_note-b',
        score: 0.8,
      });

      // Turn 1: returns engram1.
      mockHybrid.mockResolvedValue([engram1]);
      mockCreate.mockResolvedValue(makeLlmResponse('First turn.'));
      const { conversationId } = await runChatPipeline(persistence, engine, {
        message: 'First question',
      });

      // Turn 2: returns engram1 again (updated score) + engram2.
      mockHybrid.mockResolvedValue([{ ...engram1, score: 0.95 }, engram2]);
      mockCreate.mockResolvedValue(makeLlmResponse('Second turn.'));
      await runChatPipeline(persistence, engine, {
        conversationId,
        message: 'Follow-up',
      });

      const rows = rawDb
        .prepare('SELECT * FROM conversation_context WHERE conversation_id = ? ORDER BY engram_id')
        .all(conversationId) as Array<{
        engram_id: string;
        relevance_score: number;
      }>;

      // engram1 should be updated (upsert), engram2 added — total 2.
      expect(rows).toHaveLength(2);
      const noteA = rows.find((r) => r.engram_id === 'eng_20260401_1000_note-a');
      expect(noteA!.relevance_score).toBeCloseTo(0.95, 2);
    });
  });

  // -----------------------------------------------------------------------
  // Scope negotiation
  // -----------------------------------------------------------------------

  describe('scope negotiation', () => {
    it('narrows to work scopes when message contains work phrases', async () => {
      mockHybrid.mockResolvedValue([]);
      mockCreate.mockResolvedValue(makeLlmResponse('Work info here.'));

      const { conversationId } = await runChatPipeline(persistence, engine, {
        message: 'What did I write at work about the project deadline?',
        scopes: [],
        knownScopes: ['work.projects', 'work.meetings', 'personal.journal'],
      });

      const loaded = persistence.getConversation(conversationId);
      // Scope negotiation should have narrowed to work scopes.
      const scopes = loaded!.conversation.activeScopes;
      expect(scopes.every((s) => s.startsWith('work.'))).toBe(true);
    });

    it('narrows to personal scopes when message contains personal phrases', async () => {
      mockHybrid.mockResolvedValue([]);
      mockCreate.mockResolvedValue(makeLlmResponse('Personal info here.'));

      const { conversationId } = await runChatPipeline(persistence, engine, {
        message: 'Show me my personal journal entries',
        scopes: [],
        knownScopes: ['work.projects', 'personal.journal', 'personal.health'],
      });

      const loaded = persistence.getConversation(conversationId);
      const scopes = loaded!.conversation.activeScopes;
      expect(scopes.every((s) => s.startsWith('personal.'))).toBe(true);
    });

    it('includes a scope notice in response when scopes change', async () => {
      mockHybrid.mockResolvedValue([]);
      mockCreate.mockResolvedValue(makeLlmResponse('Work response.'));

      const { result } = await runChatPipeline(persistence, engine, {
        message: 'What happened at work today?',
        scopes: [],
        knownScopes: ['work.projects', 'personal.journal'],
      });

      expect(result.scopeNegotiation).toBeDefined();
      expect(result.scopeNegotiation!.changed).toBe(true);
      expect(result.scopeNegotiation!.reason).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // Cascade deletion
  // -----------------------------------------------------------------------

  describe('cascade deletion', () => {
    it('deleting a conversation removes all messages and context', async () => {
      mockHybrid.mockResolvedValue([makeRetrievalResult()]);
      mockCreate.mockResolvedValue(
        makeLlmResponse('Info from [eng_20260417_0942_agent-coordination].')
      );

      const { conversationId } = await runChatPipeline(persistence, engine, {
        message: 'Tell me about coordination',
        scopes: ['work.projects'],
      });

      // Sanity: data exists.
      expect(persistence.getConversation(conversationId)).not.toBeNull();
      const msgsBefore = rawDb
        .prepare('SELECT count(*) as c FROM messages WHERE conversation_id = ?')
        .get(conversationId) as { c: number };
      expect(msgsBefore.c).toBeGreaterThan(0);
      const ctxBefore = rawDb
        .prepare('SELECT count(*) as c FROM conversation_context WHERE conversation_id = ?')
        .get(conversationId) as { c: number };
      expect(ctxBefore.c).toBeGreaterThan(0);

      // Delete.
      persistence.deleteConversation(conversationId);

      // Conversation gone.
      expect(persistence.getConversation(conversationId)).toBeNull();

      // Messages gone.
      const msgsAfter = rawDb
        .prepare('SELECT count(*) as c FROM messages WHERE conversation_id = ?')
        .get(conversationId) as { c: number };
      expect(msgsAfter.c).toBe(0);

      // Context gone.
      const ctxAfter = rawDb
        .prepare('SELECT count(*) as c FROM conversation_context WHERE conversation_id = ?')
        .get(conversationId) as { c: number };
      expect(ctxAfter.c).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Idempotency
  // -----------------------------------------------------------------------

  describe('idempotency', () => {
    it('upserting the same context engram does not create duplicates', async () => {
      const conv = persistence.createConversation({
        model: 'claude-sonnet-4-20250514',
      });

      persistence.upsertContext(conv.id, 'eng_20260401_1000_note', 0.8);
      persistence.upsertContext(conv.id, 'eng_20260401_1000_note', 0.9);
      persistence.upsertContext(conv.id, 'eng_20260401_1000_note', 0.95);

      const rows = rawDb
        .prepare('SELECT * FROM conversation_context WHERE conversation_id = ?')
        .all(conv.id) as Array<{ engram_id: string; relevance_score: number }>;

      expect(rows).toHaveLength(1);
      expect(rows[0]!.relevance_score).toBeCloseTo(0.95, 2);
    });
  });

  // -----------------------------------------------------------------------
  // Scope negotiator (direct, for coverage of edge cases)
  // -----------------------------------------------------------------------

  describe('scope negotiator edge cases', () => {
    it('detects secret mention and returns a notice', () => {
      const negotiator = new ConversationScopeNegotiator();
      const notice = negotiator.detectSecretMention('Show me my password notes');
      expect(notice).toBeTruthy();
      expect(notice).toContain('sensitive data');
    });

    it('does not flag secret mention for unlock phrases', () => {
      const negotiator = new ConversationScopeNegotiator();
      const notice = negotiator.detectSecretMention('include my secret notes');
      expect(notice).toBeNull();
    });

    it('unlocks all scopes including secrets when unlock phrase used', () => {
      const negotiator = new ConversationScopeNegotiator();
      const result = negotiator.negotiate({
        message: 'include my secrets',
        currentScopes: ['personal.journal'],
        conversationHistory: [],
        channel: 'shell',
        knownScopes: ['personal.journal', 'personal.secret.keys', 'work.projects'],
      });

      expect(result.changed).toBe(true);
      expect(result.scopes).toContain('personal.secret.keys');
      expect(result.reason).toContain('Secret scopes unlocked');
    });
  });
});
