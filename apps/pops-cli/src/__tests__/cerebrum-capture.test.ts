/**
 * Tests for `pops cerebrum capture` — PRD-081 US-03 AC #1, #7.
 *
 * Exercises the command handler directly against a stubbed global `fetch`,
 * which is the only seam between the CLI and the API. Avoids spawning a
 * subprocess so the tests stay deterministic and fast.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runCapture } from '../commands/cerebrum-capture.js';
import {
  CaptureStream,
  getFetchCall,
  getFetchJson,
  mockFetchOk,
  mockFetchRestError,
  mockFetchUnreachable,
  pipedStdin,
  ttyStdin,
} from './test-helpers.js';

describe('runCapture', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('captures text passed as an argument and prints engram metadata (AC #1)', async () => {
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const fetchSpy = mockFetchOk({
      id: 'eng_20260427_1500_idea',
      path: 'capture/eng_20260427_1500_idea.md',
      type: 'capture',
      scopes: ['personal.captures'],
    });

    const code = await runCapture({
      text: 'a quick thought',
      stdout,
      stderr,
      stdin: ttyStdin(),
      env: { POPS_API_URL: 'http://api.test' },
    });

    expect(code).toBe(0);
    const { url, init } = getFetchCall(fetchSpy);
    expect(url).toBe('http://api.test/ingest/quick-capture');
    expect(init.method).toBe('POST');
    expect(getFetchJson(fetchSpy)).toEqual({
      text: 'a quick thought',
      source: 'cli',
    });
    expect(stdout.text()).toContain('Captured eng_20260427_1500_idea');
    expect(stdout.text()).toContain('path:   capture/eng_20260427_1500_idea.md');
    expect(stdout.text()).toContain('scopes: personal.captures');
  });

  it('reads text from stdin when no argument is provided (AC #1)', async () => {
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    mockFetchOk({
      id: 'eng_x',
      path: 'capture/eng_x.md',
      type: 'capture',
      scopes: ['personal.captures'],
    });

    const code = await runCapture({
      stdout,
      stderr,
      stdin: pipedStdin('piped thought\n'),
      env: {},
    });

    expect(code).toBe(0);
    expect(stdout.text()).toContain('Captured eng_x');
  });

  it('rejects empty/whitespace input with a non-zero exit code (AC #3)', async () => {
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const fetchSpy = mockFetchOk({
      id: 'should-not-be-called',
      path: 'x',
      type: 'capture',
      scopes: [],
    });

    const code = await runCapture({
      text: '   ',
      stdout,
      stderr,
      stdin: ttyStdin(),
      env: {},
    });

    expect(code).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(stderr.text()).toContain('capture requires text');
  });

  it('exits with a network-error code when the API is unreachable (AC #4)', async () => {
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    mockFetchUnreachable();

    const code = await runCapture({
      text: 'hello',
      stdout,
      stderr,
      stdin: ttyStdin(),
      env: { POPS_API_URL: 'http://localhost:9999' },
    });

    expect(code).toBe(3);
    expect(stderr.text()).toContain('Unable to reach the POPS API at http://localhost:9999');
  });

  it('forwards the X-API-Key header when POPS_API_KEY is set', async () => {
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const fetchSpy = mockFetchOk({
      id: 'eng_auth',
      path: 'capture/eng_auth.md',
      type: 'capture',
      scopes: ['personal.captures'],
    });

    await runCapture({
      text: 'authenticated',
      stdout,
      stderr,
      stdin: ttyStdin(),
      env: { POPS_API_KEY: 'pops_sa_test' },
    });

    const { init } = getFetchCall(fetchSpy);
    const headers = init.headers;
    expect(headers).toBeDefined();
    if (headers && !(headers instanceof Headers) && !Array.isArray(headers)) {
      expect(headers['x-api-key']).toBe('pops_sa_test');
    } else {
      throw new Error('expected plain-object headers');
    }
  });

  it('surfaces server-side validation errors with the API message', async () => {
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    mockFetchRestError('text must be a non-empty string', 400);

    const code = await runCapture({
      text: 'whatever',
      stdout,
      stderr,
      stdin: ttyStdin(),
      env: {},
    });

    expect(code).toBe(1);
    expect(stderr.text()).toContain('text must be a non-empty string');
  });

  it('uses the source option override when provided', async () => {
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const fetchSpy = mockFetchOk({
      id: 'eng_src',
      path: 'capture/eng_src.md',
      type: 'capture',
      scopes: ['personal.captures'],
    });

    await runCapture({
      text: 'from moltbot',
      source: 'moltbot',
      stdout,
      stderr,
      stdin: ttyStdin(),
      env: {},
    });

    expect(getFetchJson(fetchSpy)).toEqual({
      text: 'from moltbot',
      source: 'moltbot',
    });
  });
});
