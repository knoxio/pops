/**
 * Telemetry test for the cerebrum ingest LLM port (request/response).
 * The Anthropic SDK is the only mock (the network boundary; tests MUST NOT
 * reach a real API). The `@pops/ai-telemetry` wrapper runs for real with an
 * injected fake `report` + `lookupPricing`, asserting `AnthropicIngestLlm`
 * reports usage to the ai pillar with the request's operation + the cerebrum
 * domain, and returns the model text unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InferenceRecord, PricingEntry } from '@pops/ai-telemetry';

const createMock = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock };
  },
}));

const { AnthropicIngestLlm } = await import('../llm.js');
const { __setCerebrumTelemetryDepsForTests } = await import('../../ai-telemetry-deps.js');

const KEY = 'ANTHROPIC_API_KEY';
const PRICING: PricingEntry = { input: 2, output: 8 };

function textResponse(text: string, inputTokens = 50, outputTokens = 10) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
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
  createMock.mockReset();
  process.env[KEY] = 'sk-test';
});

afterEach(() => {
  __setCerebrumTelemetryDepsForTests(null);
  delete process.env[KEY];
});

describe('AnthropicIngestLlm.complete — telemetry', () => {
  it('reports a success record with the request operation + cerebrum domain and returns the text unchanged', async () => {
    const captured = captureReports();
    createMock.mockResolvedValue(textResponse('classified-output'));

    const text = await new AnthropicIngestLlm().complete({
      operation: 'ingest.classify',
      model: 'claude-haiku-4-5-20251001',
      prompt: 'classify this',
      maxTokens: 64,
    });
    const record = await captured.nextReport();

    expect(text).toBe('classified-output');
    expect(record.operation).toBe('ingest.classify');
    expect(record.domain).toBe('cerebrum');
    expect(record.provider).toBe('anthropic');
    expect(record.model).toBe('claude-haiku-4-5-20251001');
    expect(record.status).toBe('success');
    expect(record.inputTokens).toBe(50);
    expect(record.outputTokens).toBe(10);
    expect(record.costUsd).toBeCloseTo(0.00018, 9);
  });

  it('reports a status:error record when the API throws (caller still degrades to null)', async () => {
    const captured = captureReports();
    createMock.mockRejectedValue(new Error('boom'));

    const text = await new AnthropicIngestLlm().complete({
      operation: 'ingest.entities',
      model: 'claude-haiku-4-5-20251001',
      prompt: 'extract',
      maxTokens: 64,
    });
    const record = await captured.nextReport();

    expect(text).toBeNull();
    expect(record.status).toBe('error');
    expect(record.operation).toBe('ingest.entities');
    expect(record.domain).toBe('cerebrum');
    expect(record.inputTokens).toBe(0);
    expect(record.errorMessage).toBeDefined();
  });
});
