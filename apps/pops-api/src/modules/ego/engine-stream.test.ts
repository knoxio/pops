/**
 * Unit tests for the engine streaming generator (PRD-087 US-01 AC #6).
 *
 * Tests that generateStreamEvents correctly:
 * - Yields scope notices as the first token
 * - Passes through text deltas from the LLM
 * - Parses citations from the completed text
 * - Yields a done event with final metadata
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the LLM client.
vi.mock('./llm-client.js', () => ({
  streamChatLlm: vi.fn(),
}));

// Mock the citation parser — must use a class so `new` works.
const mockCitationParse = vi.fn((text: string) => ({
  cleanedAnswer: text,
  citations: [] as Array<{ id: string }>,
}));
vi.mock('../cerebrum/query/citation-parser.js', () => ({
  CitationParser: class MockCitationParser {
    parse = mockCitationParse;
  },
}));

import { generateStreamEvents } from './engine-stream.js';
import { streamChatLlm } from './llm-client.js';

import type { StreamEvent } from './llm-client.js';
import type { ChatStreamEvent } from './types.js';

const mockedStreamChatLlm = vi.mocked(streamChatLlm);

/** Collect all events from an async generator. */
async function collect(gen: AsyncGenerator<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

/** Create a mock async generator from an array of events. */
async function* mockLlmStream(events: StreamEvent[]): AsyncGenerator<StreamEvent> {
  for (const event of events) {
    yield event;
  }
}

describe('generateStreamEvents', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('yields scope notice as first token when scopes changed', async () => {
    mockedStreamChatLlm.mockReturnValue(
      mockLlmStream([
        { type: 'token', text: 'Response' },
        { type: 'done', fullText: 'Response', tokensIn: 10, tokensOut: 5 },
      ])
    );

    const events = await collect(
      generateStreamEvents({
        model: 'test-model',
        systemPrompt: 'system',
        llmMessages: [{ role: 'user', content: 'hi' }],
        scopeNotice: '*Scope changed to finance*',
        allResults: [],
      })
    );

    expect(events[0]).toEqual({ type: 'token', text: '*Scope changed to finance*\n\n' });
    expect(events[1]).toEqual({ type: 'token', text: 'Response' });
    expect(events[2]).toMatchObject({ type: 'done', tokensIn: 10, tokensOut: 5 });
  });

  it('yields tokens without scope notice when no scope change', async () => {
    mockedStreamChatLlm.mockReturnValue(
      mockLlmStream([
        { type: 'token', text: 'Hello' },
        { type: 'token', text: ' world' },
        { type: 'done', fullText: 'Hello world', tokensIn: 20, tokensOut: 10 },
      ])
    );

    const events = await collect(
      generateStreamEvents({
        model: 'test-model',
        systemPrompt: 'system',
        llmMessages: [{ role: 'user', content: 'hi' }],
        scopeNotice: null,
        allResults: [],
      })
    );

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: 'token', text: 'Hello' });
    expect(events[1]).toEqual({ type: 'token', text: ' world' });
    expect(events[2]).toMatchObject({
      type: 'done',
      content: 'Hello world',
      tokensIn: 20,
      tokensOut: 10,
    });
  });

  it('includes citation IDs in the done event', async () => {
    // Override the parse mock to return citations for this test.
    mockCitationParse.mockReturnValueOnce({
      cleanedAnswer: 'Answer with citation',
      citations: [{ id: 'eng_20260101_0000_test' }],
    });

    mockedStreamChatLlm.mockReturnValue(
      mockLlmStream([
        { type: 'token', text: 'Answer [eng_20260101_0000_test]' },
        { type: 'done', fullText: 'Answer [eng_20260101_0000_test]', tokensIn: 15, tokensOut: 8 },
      ])
    );

    const events = await collect(
      generateStreamEvents({
        model: 'test-model',
        systemPrompt: 'system',
        llmMessages: [{ role: 'user', content: 'hi' }],
        scopeNotice: null,
        allResults: [],
      })
    );

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    if (doneEvent?.type === 'done') {
      expect(doneEvent.citations).toEqual(['eng_20260101_0000_test']);
    }
  });

  it('passes model and system prompt to the LLM stream', async () => {
    mockedStreamChatLlm.mockReturnValue(
      mockLlmStream([{ type: 'done', fullText: '', tokensIn: 0, tokensOut: 0 }])
    );

    await collect(
      generateStreamEvents({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'You are Ego',
        llmMessages: [{ role: 'user', content: 'test' }],
        scopeNotice: null,
        allResults: [],
      })
    );

    expect(mockedStreamChatLlm).toHaveBeenCalledWith('claude-sonnet-4-20250514', 'You are Ego', [
      { role: 'user', content: 'test' },
    ]);
  });
});
