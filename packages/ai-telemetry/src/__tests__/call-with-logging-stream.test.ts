import { describe, expect, it, vi } from 'vitest';

import { callWithLoggingStream } from '../call-with-logging-stream.js';

import type { InferenceContext, LookupPricingFn, ReportInferenceFn } from '../types.js';

interface StreamEvent {
  type?: string;
  tokensIn?: number;
  tokensOut?: number;
}

const ctx: InferenceContext = {
  provider: 'anthropic',
  model: 'claude-haiku-4-5',
  operation: 'ego.stream',
  domain: 'cerebrum',
};

const pricing: LookupPricingFn = () => Promise.resolve({ input: 3, output: 15 });

const extractUsage = (event: StreamEvent | undefined) =>
  event?.type === 'done'
    ? { inputTokens: event.tokensIn ?? 0, outputTokens: event.tokensOut ?? 0 }
    : null;

async function* fromEvents(events: StreamEvent[]): AsyncGenerator<StreamEvent> {
  for (const event of events) yield event;
}

async function* throwAfter(events: StreamEvent[], error: Error): AsyncGenerator<StreamEvent> {
  for (const event of events) yield event;
  throw error;
}

async function drain(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const event of gen) out.push(event);
  return out;
}

describe('callWithLoggingStream', () => {
  it('re-yields every event verbatim and reports usage after drain', async () => {
    const report = vi.fn<ReportInferenceFn>(() => Promise.resolve());
    const events: StreamEvent[] = [
      { type: 'delta' },
      { type: 'delta' },
      { type: 'done', tokensIn: 10, tokensOut: 5 },
    ];
    const out = await drain(
      callWithLoggingStream(
        { ...ctx, stream: () => fromEvents(events), extractUsage },
        { report, lookupPricing: pricing }
      )
    );
    expect(out).toEqual(events);
    await vi.waitFor(() => expect(report).toHaveBeenCalledTimes(1));
    const record = report.mock.calls[0]?.[0];
    expect(record).toMatchObject({ status: 'success', inputTokens: 10, outputTokens: 5 });
    // (10/1e6)*3 + (5/1e6)*15 = 0.000105
    expect(record?.costUsd).toBeCloseTo(0.000105, 9);
  });

  it('reports an error record and rethrows when the stream throws', async () => {
    const report = vi.fn<ReportInferenceFn>(() => Promise.resolve());
    await expect(
      drain(
        callWithLoggingStream(
          {
            ...ctx,
            stream: () => throwAfter([{ type: 'delta' }], new Error('mid-stream')),
            extractUsage,
          },
          { report, lookupPricing: pricing }
        )
      )
    ).rejects.toThrow('mid-stream');
    await vi.waitFor(() => expect(report).toHaveBeenCalledTimes(1));
    expect(report.mock.calls[0]?.[0]).toMatchObject({
      status: 'error',
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  it('reports tokens 0 when usage is unavailable', async () => {
    const report = vi.fn<ReportInferenceFn>(() => Promise.resolve());
    await drain(
      callWithLoggingStream(
        { ...ctx, stream: () => fromEvents([{ type: 'delta' }]), extractUsage },
        { report, lookupPricing: pricing }
      )
    );
    await vi.waitFor(() => expect(report).toHaveBeenCalled());
    expect(report.mock.calls[0]?.[0]).toMatchObject({
      status: 'success',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    });
  });
});
