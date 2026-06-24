/**
 * Telemetry tests for the finance categorizer. The Anthropic SDK is the only
 * mock (it is the network boundary; tests MUST NOT reach a real API); the
 * `@pops/ai-telemetry` wrapper runs for real with an injected fake `report` +
 * `lookupPricing`, so these assert the categorizer reports usage to the ai
 * pillar with the right operation/domain and returns its result unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InferenceRecord, PricingEntry } from '@pops/ai-telemetry';

const createMock = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock };
  },
}));

const { categorizeWithAi } = await import('../ai-categorizer.js');
const { __setFinanceTelemetryDepsForTests } = await import('../../ai-telemetry-deps.js');

const FLAG = 'FINANCE_AI_CATEGORIZER_ENABLED';
const KEY = 'ANTHROPIC_API_KEY';

const PRICING: PricingEntry = { input: 1, output: 5 };

function textResponse(text: string, inputTokens = 100, outputTokens = 20) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

interface Captured {
  records: InferenceRecord[];
  /** Resolves once the fire-and-forget report lands. */
  nextReport: () => Promise<InferenceRecord>;
}

function captureReports(pricing: PricingEntry | null = PRICING): Captured {
  const records: InferenceRecord[] = [];
  let resolveNext: ((r: InferenceRecord) => void) | undefined;
  const deps = {
    lookupPricing: () => Promise.resolve(pricing),
    report: (record: InferenceRecord): Promise<void> => {
      records.push(record);
      resolveNext?.(record);
      return Promise.resolve();
    },
  };
  __setFinanceTelemetryDepsForTests(deps);
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
  process.env[FLAG] = 'true';
  process.env[KEY] = 'sk-test';
});

afterEach(() => {
  __setFinanceTelemetryDepsForTests(null);
  delete process.env[FLAG];
  delete process.env[KEY];
  delete process.env['FINANCE_AI_CATEGORIZER_MODEL'];
});

describe('categorizeWithAi — telemetry', () => {
  it('reports a success record (operation/domain/usage/cost) and returns the result unchanged', async () => {
    const captured = captureReports();
    createMock.mockResolvedValue(textResponse('{"entityName":"Woolworths","tags":["groceries"]}'));

    const out = await categorizeWithAi('WOOLWORTHS 1234', 'batch-9', ['groceries']);
    const record = await captured.nextReport();

    expect(out.result?.entityName).toBe('Woolworths');
    expect(out.usage).toEqual({ inputTokens: 100, outputTokens: 20, costUsd: 0.0002 });

    expect(record.operation).toBe('imports.categorize');
    expect(record.domain).toBe('finance');
    expect(record.provider).toBe('anthropic');
    expect(record.model).toBe('claude-haiku-4-5-20251001');
    expect(record.status).toBe('success');
    expect(record.inputTokens).toBe(100);
    expect(record.outputTokens).toBe(20);
    expect(record.costUsd).toBeCloseTo(0.0002, 9);
    expect(record.contextId).toBe('import_batch:batch-9');
  });

  it('keeps the description out of telemetry (no raw row in contextId/metadata)', async () => {
    const captured = captureReports();
    createMock.mockResolvedValue(textResponse('{"entityName":"Aldi","tags":[]}'));

    await categorizeWithAi('ALDI SUPERMARKET 4455 SYDNEY', 'batch-1');
    const record = await captured.nextReport();

    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain('ALDI SUPERMARKET');
    expect(record.contextId).toBe('import_batch:batch-1');
  });

  it('reports a status:error record when the API throws, and still propagates', async () => {
    const captured = captureReports();
    createMock.mockRejectedValue(new Error('network down'));

    await expect(categorizeWithAi('X', 'batch-2')).rejects.toBeDefined();
    const record = await captured.nextReport();

    expect(record.status).toBe('error');
    expect(record.operation).toBe('imports.categorize');
    expect(record.domain).toBe('finance');
    expect(record.inputTokens).toBe(0);
    expect(record.outputTokens).toBe(0);
    expect(record.errorMessage).toBeDefined();
  });
});
