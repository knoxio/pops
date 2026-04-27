import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RetrievalResult } from '../../cerebrum/retrieval/types.js';
import type { ChatParams, Message } from '../types.js';

// --- Mocks ---

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

vi.mock('../../cerebrum/instance.js', () => ({
  getEngramService: () => ({
    read: () => {
      throw new Error('No engram in test context');
    },
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

// --- Helpers ---

function makeMessage(
  overrides: Partial<Message> & { role: Message['role']; content: string }
): Message {
  return {
    id: `msg_test_${Math.random().toString(36).slice(2, 8)}`,
    conversationId: 'conv_test_001',
    citations: null,
    toolCalls: null,
    tokensIn: null,
    tokensOut: null,
    createdAt: new Date().toISOString(),
    ...overrides,
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

function defaultChatParams(overrides?: Partial<ChatParams>): ChatParams {
  return {
    conversationId: 'conv_test_001',
    message: 'What do I know about agent coordination?',
    history: [],
    activeScopes: ['work.projects'],
    ...overrides,
  };
}

/** Extract the filters argument from the most recent mockHybrid call. */
function getHybridFilters(): Record<string, unknown> {
  const call = mockHybrid.mock.calls[0];
  return (call?.[1] ?? {}) as Record<string, unknown>;
}

// --- Tests ---

describe('ConversationEngine', () => {
  let engine: InstanceType<typeof ConversationEngine>;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new ConversationEngine();
  });

  describe('chat', () => {
    it('returns a response with citations from retrieved engrams', async () => {
      const retrievalResult = makeRetrievalResult();
      mockHybrid.mockResolvedValue([retrievalResult]);
      mockCreate.mockResolvedValue(
        makeLlmResponse(
          'Based on your notes, agent coordination involves [eng_20260417_0942_agent-coordination] orchestrating multiple AI agents.',
          200,
          80
        )
      );

      const result = await engine.chat(defaultChatParams());

      expect(result.response.content).toContain('agent coordination');
      expect(result.response.citations).toContain('eng_20260417_0942_agent-coordination');
      expect(result.response.tokensIn).toBe(200);
      expect(result.response.tokensOut).toBe(80);
      expect(result.retrievedEngrams).toHaveLength(1);
      expect(result.retrievedEngrams[0]?.engramId).toBe('eng_20260417_0942_agent-coordination');
      expect(result.retrievedEngrams[0]?.relevanceScore).toBe(0.85);
    });

    it('includes conversation history in the LLM call', async () => {
      mockHybrid.mockResolvedValue([]);
      mockCreate.mockResolvedValue(makeLlmResponse('I recall you asked about agents earlier.'));

      const history: Message[] = [
        makeMessage({ role: 'user', content: 'Tell me about AI agents' }),
        makeMessage({
          role: 'assistant',
          content: 'AI agents are autonomous programs that can take actions.',
        }),
      ];

      await engine.chat(defaultChatParams({ history }));

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockCreate.mock.calls[0]?.[0] as {
        messages: Array<{ role: string; content: string }>;
      };
      // Should include 2 history messages + 1 current message = 3 total
      expect(callArgs.messages).toHaveLength(3);
      expect(callArgs.messages[0]?.content).toBe('Tell me about AI agents');
      expect(callArgs.messages[1]?.content).toBe(
        'AI agents are autonomous programs that can take actions.'
      );
    });

    it('truncates history at maxHistoryMessages', async () => {
      mockHybrid.mockResolvedValue([]);
      mockCreate.mockResolvedValue(makeLlmResponse('Response based on recent history.'));

      // Create 25 messages (exceeds default 20).
      const history: Message[] = [];
      for (let i = 0; i < 25; i++) {
        history.push(
          makeMessage({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Message ${i}`,
          })
        );
      }

      // Use a config with maxHistoryMessages = 10 for easier testing.
      const smallEngine = new ConversationEngine({ maxHistoryMessages: 10 });
      await smallEngine.chat(defaultChatParams({ history }));

      const callArgs = mockCreate.mock.calls[0]?.[0] as {
        messages: Array<{ role: string; content: string }>;
      };
      // 10 history messages + 1 current message = 11
      expect(callArgs.messages).toHaveLength(11);
      // Should include the most recent messages (15-24), not the oldest.
      expect(callArgs.messages[0]?.content).toBe('Message 15');
    });

    it('includes active scopes in system prompt', async () => {
      mockHybrid.mockResolvedValue([]);
      mockCreate.mockResolvedValue(makeLlmResponse('Test response.'));

      await engine.chat(defaultChatParams({ activeScopes: ['work.projects', 'personal.journal'] }));

      const callArgs = mockCreate.mock.calls[0]?.[0] as { system: string };
      expect(callArgs.system).toContain('work.projects');
      expect(callArgs.system).toContain('personal.journal');
    });

    it('records token counts from LLM response', async () => {
      mockHybrid.mockResolvedValue([]);
      mockCreate.mockResolvedValue(makeLlmResponse('Token test.', 350, 120));

      const result = await engine.chat(defaultChatParams());

      expect(result.response.tokensIn).toBe(350);
      expect(result.response.tokensOut).toBe(120);
    });

    it('handles zero retrieval results gracefully', async () => {
      mockHybrid.mockResolvedValue([]);
      mockCreate.mockResolvedValue(
        makeLlmResponse("I don't have any stored knowledge about that topic.")
      );

      const result = await engine.chat(
        defaultChatParams({ message: 'Tell me about quantum physics' })
      );

      expect(result.response.content).toContain("don't have");
      expect(result.response.citations).toHaveLength(0);
      expect(result.retrievedEngrams).toHaveLength(0);
    });

    it('excludes secret scopes from retrieval when not explicitly included', async () => {
      mockHybrid.mockResolvedValue([]);
      mockCreate.mockResolvedValue(makeLlmResponse('No secret info.'));

      await engine.chat(defaultChatParams({ activeScopes: ['work.projects'] }));

      expect(mockHybrid).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ scopes: ['work.projects'] }),
        expect.any(Number),
        expect.any(Number)
      );

      // Should not include includeSecret flag
      const filters = getHybridFilters();
      expect(filters['includeSecret']).toBeUndefined();
    });

    it('includes secret scopes when explicitly active', async () => {
      mockHybrid.mockResolvedValue([]);
      mockCreate.mockResolvedValue(makeLlmResponse('Secret info retrieved.'));

      await engine.chat(defaultChatParams({ activeScopes: ['personal.secret.keys'] }));

      const filters = getHybridFilters();
      expect(filters['includeSecret']).toBe(true);
    });

    it('includes app context in system prompt when provided', async () => {
      mockHybrid.mockResolvedValue([]);
      mockCreate.mockResolvedValue(makeLlmResponse('Finance context response.'));

      await engine.chat(
        defaultChatParams({
          appContext: {
            app: 'finance',
            route: '/transactions',
            entityType: 'transaction',
            entityId: 'txn_123',
          },
        })
      );

      const callArgs = mockCreate.mock.calls[0]?.[0] as { system: string };
      expect(callArgs.system).toContain('Finance app');
    });

    it('attaches retrieved engram context to the user message', async () => {
      const result1 = makeRetrievalResult({
        sourceId: 'eng_20260401_1000_first',
        title: 'First Engram',
      });
      const result2 = makeRetrievalResult({
        sourceId: 'eng_20260402_1100_second',
        title: 'Second Engram',
        score: 0.72,
      });
      mockHybrid.mockResolvedValue([result1, result2]);
      mockCreate.mockResolvedValue(makeLlmResponse('Response with context.'));

      await engine.chat(defaultChatParams());

      const callArgs = mockCreate.mock.calls[0]?.[0] as {
        messages: Array<{ role: string; content: string }>;
      };
      const lastMessage = callArgs.messages[callArgs.messages.length - 1];
      expect(lastMessage?.content).toContain('Retrieved knowledge');
    });

    it('filters system messages from history when building LLM messages', async () => {
      mockHybrid.mockResolvedValue([]);
      mockCreate.mockResolvedValue(makeLlmResponse('Response.'));

      const history: Message[] = [
        makeMessage({ role: 'system', content: 'System context message' }),
        makeMessage({ role: 'user', content: 'User question' }),
        makeMessage({ role: 'assistant', content: 'Assistant answer' }),
      ];

      await engine.chat(defaultChatParams({ history }));

      const callArgs = mockCreate.mock.calls[0]?.[0] as {
        messages: Array<{ role: string; content: string }>;
      };
      // System messages are excluded from the messages array (they go in system prompt).
      // So: 1 user + 1 assistant from history + 1 current user = 3
      expect(callArgs.messages).toHaveLength(3);
      // First message should be the user message, not the system message.
      expect(callArgs.messages[0]?.role).toBe('user');
      expect(callArgs.messages[0]?.content).toBe('User question');
    });
  });

  describe('summariseHistory', () => {
    it('calls LLM with a summarisation prompt', async () => {
      mockCreate.mockResolvedValue(
        makeLlmResponse('The conversation covered AI agent coordination and project planning.')
      );

      const messages: Message[] = [
        makeMessage({ role: 'user', content: 'Tell me about agents' }),
        makeMessage({ role: 'assistant', content: 'Agents are autonomous programs.' }),
      ];

      const summary = await engine.summariseHistory(messages);

      expect(summary).toContain('agent coordination');
      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockCreate.mock.calls[0]?.[0] as {
        messages: Array<{ content: string }>;
      };
      expect(callArgs.messages[0]?.content).toContain('Summarise this conversation');
    });
  });
});
