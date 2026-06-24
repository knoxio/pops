/**
 * Telemetry test for the cerebrum ego LLM streaming path.
 * The Anthropic SDK is the only mock (the network boundary; tests MUST NOT
 * reach a real API). `AnthropicEgoLlm.stream` runs for real through
 * `callWithLoggingStream` with an injected fake `report` + `lookupPricing`,
 * asserting it re-yields every event verbatim and — after the terminal `done`
 * event — reports usage to the ai pillar (operation `ego.stream`, domain
 * `cerebrum`) with the tokens read from `finalMessage()`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InferenceRecord, PricingEntry } from '@pops/ai-telemetry';

const streamMock = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { stream: streamMock };
  },
}));

const { AnthropicEgoLlm } = await import('../llm.js');
const { __setCerebrumTelemetryDepsForTests } = await import('../../ai-telemetry-deps.js');

const KEY = 'ANTHROPIC_API_KEY';
const PRICING: PricingEntry = { input: 3, output: 15 };

interface TextDelta {
  type: 'content_block_delta';
  delta: { type: 'text_delta'; text: string };
}

/** A fake Anthropic MessageStream: async-iterable deltas + a final usage record. */
function fakeMessageStream(
  deltas: string[],
  usage: { input_tokens: number; output_tokens: number }
): AsyncIterable<TextDelta> & { finalMessage: () => Promise<{ usage: typeof usage }> } {
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<TextDelta> {
      for (const text of deltas) {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
      }
    },
    finalMessage: () => Promise.resolve({ usage }),
  };
}

function captureReports(pricing: PricingEntry | null = PRICING): {
  records: InferenceRecord[];
  nextReport: () => Promise<InferenceRecord>;
} {
  const records: InferenceRecord[] = [];
  let resolveNext: ((r: InferenceRecord) => void) | undefined;
  __setCerebrumTelemetryDepsForTests({
    lookupPricing: () => Promise.resolve(pricing),
    report: (record: InferenceRecord): Promise<void> => {
      records.push(record);
      resolveNext?.(record);
      return Promise.resolve();
    },
  });
  return {
    records,
    nextReport: () =>
      new Promise<InferenceRecord>((resolve) => {
        if (records.length > 0) {
          resolve(records[records.length - 1]!);
          return;
        }
        resolveNext = resolve;
      }),
  };
}

beforeEach(() => {
  streamMock.mockReset();
  process.env[KEY] = 'sk-test';
});

afterEach(() => {
  __setCerebrumTelemetryDepsForTests(null);
  delete process.env[KEY];
});

describe('AnthropicEgoLlm.stream — telemetry', () => {
  it('re-yields events verbatim and reports a success record with stream usage', async () => {
    const captured = captureReports();
    streamMock.mockReturnValue(
      fakeMessageStream(['Hello', ', world'], { input_tokens: 12, output_tokens: 7 })
    );

    const events = [];
    for await (const event of new AnthropicEgoLlm().stream('sys', [
      { role: 'user', content: 'hi' },
    ])) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'token', text: 'Hello' },
      { type: 'token', text: ', world' },
      { type: 'done', fullText: 'Hello, world', tokensIn: 12, tokensOut: 7 },
    ]);

    const record = await captured.nextReport();
    expect(record.operation).toBe('ego.stream');
    expect(record.domain).toBe('cerebrum');
    expect(record.provider).toBe('anthropic');
    expect(record.status).toBe('success');
    expect(record.inputTokens).toBe(12);
    expect(record.outputTokens).toBe(7);
    expect(record.costUsd).toBeCloseTo(0.000141, 9);
  });

  it('degrades to a fallback done and still reports (zero-usage success) when finalMessage rejects', async () => {
    const captured = captureReports();
    streamMock.mockReturnValue({
      async *[Symbol.asyncIterator](): AsyncIterator<TextDelta> {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } };
      },
      finalMessage: () => Promise.reject(new Error('no final')),
    });

    const events = [];
    for await (const event of new AnthropicEgoLlm().stream('sys', [
      { role: 'user', content: 'hi' },
    ])) {
      events.push(event);
    }

    // The inner generator swallows the processing error into a fallback `done`
    // (tokens 0), so the wrapper observes a clean completion and reports a
    // zero-usage success — the engine never throws into the SSE route.
    expect(events).toContainEqual({ type: 'token', text: 'partial' });
    expect(events.at(-1)).toMatchObject({ type: 'done', tokensIn: 0, tokensOut: 0 });

    const record = await captured.nextReport();
    expect(record.domain).toBe('cerebrum');
    expect(record.operation).toBe('ego.stream');
    expect(record.status).toBe('success');
    expect(record.inputTokens).toBe(0);
    expect(record.outputTokens).toBe(0);
  });
});
