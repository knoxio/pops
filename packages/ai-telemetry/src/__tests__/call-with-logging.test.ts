import { describe, expect, it, vi } from 'vitest';

import { callWithLogging, computeCostUsd } from '../call-with-logging.js';

import type { InferenceContext, LookupPricingFn, ReportInferenceFn } from '../types.js';

const ctx: InferenceContext = {
  provider: 'anthropic',
  model: 'claude-haiku-4-5',
  operation: 'categorize',
  domain: 'finance',
};

const pricing: LookupPricingFn = () => Promise.resolve({ input: 3, output: 15 });

describe('computeCostUsd', () => {
  it('computes from per-million-token pricing', () => {
    expect(computeCostUsd(1_000_000, 1_000_000, { input: 3, output: 15 })).toEqual({
      costUsd: 18,
      missing: false,
    });
  });

  it('flags unknown pricing', () => {
    expect(computeCostUsd(10, 10, null)).toEqual({ costUsd: 0, missing: true });
  });
});

describe('callWithLogging', () => {
  it('returns the response on the hot path', async () => {
    const report: ReportInferenceFn = vi.fn(() => Promise.resolve());
    const result = await callWithLogging(
      {
        ...ctx,
        call: () =>
          Promise.resolve({ response: 'RESP', usage: { inputTokens: 1, outputTokens: 1 } }),
      },
      { report, lookupPricing: pricing }
    );
    expect(result).toBe('RESP');
  });

  it('reports a success record with computed cost off the hot path', async () => {
    const report = vi.fn<ReportInferenceFn>(() => Promise.resolve());
    await callWithLogging(
      {
        ...ctx,
        call: () =>
          Promise.resolve({ response: 1, usage: { inputTokens: 1_000_000, outputTokens: 0 } }),
      },
      { report, lookupPricing: pricing }
    );
    await vi.waitFor(() => expect(report).toHaveBeenCalledTimes(1));
    expect(report.mock.calls[0]?.[0]).toMatchObject({
      status: 'success',
      domain: 'finance',
      inputTokens: 1_000_000,
      outputTokens: 0,
      costUsd: 3,
      cached: false,
    });
  });

  it('reports an error record and rethrows when the call throws', async () => {
    const report = vi.fn<ReportInferenceFn>(() => Promise.resolve());
    await expect(
      callWithLogging(
        { ...ctx, call: () => Promise.reject(new Error('boom')) },
        { report, lookupPricing: pricing }
      )
    ).rejects.toThrow('boom');
    await vi.waitFor(() => expect(report).toHaveBeenCalledTimes(1));
    expect(report.mock.calls[0]?.[0]).toMatchObject({
      status: 'error',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      errorMessage: 'boom',
    });
  });

  it('swallows a failing sink via warn without throwing', async () => {
    const warn = vi.fn();
    const report: ReportInferenceFn = () => Promise.reject(new Error('sink down'));
    const result = await callWithLogging(
      {
        ...ctx,
        call: () => Promise.resolve({ response: 'ok', usage: { inputTokens: 1, outputTokens: 1 } }),
      },
      { report, lookupPricing: pricing, warn }
    );
    expect(result).toBe('ok');
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
  });

  it('records costUsd 0 when pricing is unknown', async () => {
    const report = vi.fn<ReportInferenceFn>(() => Promise.resolve());
    await callWithLogging(
      {
        ...ctx,
        call: () =>
          Promise.resolve({ response: 1, usage: { inputTokens: 100, outputTokens: 100 } }),
      },
      { report, lookupPricing: () => Promise.resolve(null) }
    );
    await vi.waitFor(() => expect(report).toHaveBeenCalled());
    expect(report.mock.calls[0]?.[0]).toMatchObject({ status: 'success', costUsd: 0 });
  });
});
