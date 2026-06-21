import { afterEach, describe, expect, it, vi } from 'vitest';

import { type InferenceRecord } from '../record-schema.js';
import { createEnvReportSink } from '../report-sink.js';

const record: InferenceRecord = {
  provider: 'anthropic',
  model: 'claude-haiku-4-5',
  operation: 'categorize',
  domain: 'finance',
  inputTokens: 10,
  outputTokens: 5,
  costUsd: 0.001,
  latencyMs: 120,
  status: 'success',
  cached: false,
};

const okFetch = (): ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) =>
  vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(new Response(null, { status: 200 }))
  );

afterEach(() => {
  delete process.env['AI_API_URL'];
  delete process.env['POPS_API_URL'];
  delete process.env['POPS_API_INTERNAL_TOKEN'];
});

describe('createEnvReportSink', () => {
  it('POSTs the record to /ai-usage/record with the internal token header', async () => {
    const fetchImpl = okFetch();
    await createEnvReportSink({ baseUrl: 'http://ai-api:3008', token: 'secret', fetchImpl })(
      record
    );

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://ai-api:3008/ai-usage/record');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('x-pops-internal-token')).toBe('secret');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      provider: 'anthropic',
      domain: 'finance',
    });
  });

  it('is a no-op when no base URL resolves', async () => {
    const fetchImpl = okFetch();
    await createEnvReportSink({ fetchImpl })(record);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('prefers AI_API_URL over a self-pointing POPS_API_URL', async () => {
    process.env['AI_API_URL'] = 'http://ai-api:3008';
    process.env['POPS_API_URL'] = 'http://food-api:3005';
    const fetchImpl = okFetch();
    await createEnvReportSink({ fetchImpl })(record);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('http://ai-api:3008/ai-usage/record');
  });

  it('falls back to POPS_API_URL when AI_API_URL is unset', async () => {
    process.env['POPS_API_URL'] = 'http://self:3005';
    const fetchImpl = okFetch();
    await createEnvReportSink({ fetchImpl })(record);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('http://self:3005/ai-usage/record');
  });

  it('omits the token header when none is configured', async () => {
    const fetchImpl = okFetch();
    await createEnvReportSink({ baseUrl: 'http://ai-api:3008/', fetchImpl })(record);
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get('x-pops-internal-token')).toBeNull();
    // trailing slash on the base URL is trimmed, not doubled
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('http://ai-api:3008/ai-usage/record');
  });
});
