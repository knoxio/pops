/**
 * Unit tests for the streaming LLM client (PRD-087 US-01 AC #6).
 *
 * Mocks the Anthropic SDK to verify token-by-token streaming behavior,
 * fallback when the API key is missing, and error recovery.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock env before importing the module under test.
vi.mock('../../env.js', () => ({
  getEnv: vi.fn(),
}));

// Mock inference tracking (no DB in unit tests).
vi.mock('../../lib/inference-middleware.js', () => ({
  trackInference: vi.fn((_params, fn) => fn()),
}));

// Mock logger.
vi.mock('../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mock the Anthropic SDK — must use a class so `new` works.
const mockMessagesStream = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { stream: mockMessagesStream };
    },
  };
});

import { getEnv } from '../../env.js';
import { streamChatLlm } from './llm-client.js';

import type { StreamEvent } from './llm-client.js';

const mockedGetEnv = vi.mocked(getEnv);

/** Collect all events from an async generator into an array. */
async function collectEvents(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

/** Create a mock async iterable that yields the given stream events. */
function createMockStream(
  events: Array<{ type: string; delta?: { type: string; text: string }; index?: number }>,
  finalMessage: { usage: { input_tokens: number; output_tokens: number } }
): { [Symbol.asyncIterator]: () => AsyncIterator<unknown>; finalMessage: () => Promise<unknown> } {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
    finalMessage: () => Promise.resolve(finalMessage),
  };
}

describe('streamChatLlm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('yields unavailable message when API key is not set', async () => {
    mockedGetEnv.mockReturnValue(undefined);

    const events = await collectEvents(
      streamChatLlm('claude-sonnet-4-20250514', 'system', [{ role: 'user', content: 'hi' }])
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'token', text: expect.stringContaining('unavailable') });
    expect(events[1]).toMatchObject({ type: 'done', tokensIn: 0, tokensOut: 0 });
  });

  it('yields text deltas from the stream followed by a done event', async () => {
    mockedGetEnv.mockReturnValue('test-api-key');

    const mockStream = createMockStream(
      [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' }, index: 0 },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' }, index: 0 },
        { type: 'content_block_stop', index: 0 },
      ],
      { usage: { input_tokens: 100, output_tokens: 50 } }
    );

    mockMessagesStream.mockReturnValue(mockStream);

    const events = await collectEvents(
      streamChatLlm('claude-sonnet-4-20250514', 'system', [{ role: 'user', content: 'hi' }])
    );

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: 'token', text: 'Hello' });
    expect(events[1]).toEqual({ type: 'token', text: ' world' });
    expect(events[2]).toEqual({
      type: 'done',
      fullText: 'Hello world',
      tokensIn: 100,
      tokensOut: 50,
    });
  });

  it('yields error fallback when stream iteration throws', async () => {
    mockedGetEnv.mockReturnValue('test-api-key');

    const failingStream = {
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'partial' },
          index: 0,
        };
        throw new Error('Connection lost');
      },
      finalMessage: () => Promise.reject(new Error('no message')),
    };

    mockMessagesStream.mockReturnValue(failingStream);

    const events = await collectEvents(
      streamChatLlm('claude-sonnet-4-20250514', 'system', [{ role: 'user', content: 'hi' }])
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'token', text: 'partial' });
    // Done event with partial text and zero tokens.
    expect(events[1]).toMatchObject({
      type: 'done',
      fullText: 'partial',
      tokensIn: 0,
      tokensOut: 0,
    });
  });

  it('yields error message when stream fails with no text produced', async () => {
    mockedGetEnv.mockReturnValue('test-api-key');

    const failingStream = {
      [Symbol.asyncIterator]() {
        return {
          next: () => Promise.reject(new Error('Immediate failure')),
        };
      },
      finalMessage: () => Promise.reject(new Error('no message')),
    };

    mockMessagesStream.mockReturnValue(failingStream);

    const events = await collectEvents(
      streamChatLlm('claude-sonnet-4-20250514', 'system', [{ role: 'user', content: 'hi' }])
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'token', text: expect.stringContaining('error') });
    expect(events[1]).toMatchObject({ type: 'done', tokensIn: 0, tokensOut: 0 });
  });

  it('ignores non-text-delta events from the stream', async () => {
    mockedGetEnv.mockReturnValue('test-api-key');

    const mockStream = createMockStream(
      [
        { type: 'message_start' },
        { type: 'content_block_start', index: 0 },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Only text' }, index: 0 },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_stop' },
      ],
      { usage: { input_tokens: 10, output_tokens: 5 } }
    );

    mockMessagesStream.mockReturnValue(mockStream);

    const events = await collectEvents(
      streamChatLlm('claude-sonnet-4-20250514', 'system', [{ role: 'user', content: 'hi' }])
    );

    // Only the text_delta token + done event.
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'token', text: 'Only text' });
    expect(events[1]).toMatchObject({ type: 'done', fullText: 'Only text' });
  });
});
