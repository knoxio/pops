import { Readable, Writable } from 'node:stream';

import { expect, vi } from 'vitest';

/** In-memory writable stream that captures all writes for assertion. */
export class CaptureStream extends Writable {
  private chunks: string[] = [];
  // commander and a few CLI helpers access `isTTY` when checking colour
  // support; expose a deterministic value so tests don't depend on the host
  // terminal.
  readonly isTTY = false;

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    cb: (err?: Error | null) => void
  ): void {
    this.chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    cb();
  }

  text(): string {
    return this.chunks.join('');
  }
}

/** Readable stream pretending to be a piped stdin (not a TTY). */
export function pipedStdin(content: string): Readable & { isTTY: false } {
  const readable = Readable.from(Buffer.from(content, 'utf8'));
  return Object.assign(readable, { isTTY: false as const });
}

/** Readable stream pretending to be an interactive TTY (no piped input). */
export function ttyStdin(): Readable & { isTTY: true } {
  const readable = new Readable({ read() {} });
  return Object.assign(readable, { isTTY: true as const });
}

// ---------------------------------------------------------------------------
// Fetch mocking
//
// All CLI tests exercise the command handler against a stubbed global
// `fetch`. The helpers below intentionally use `vi.stubGlobal` instead of
// reaching into `globalThis` directly so cleanup is automatic (via
// `vi.unstubAllGlobals` in `afterEach`) and the test files don't need
// to perform any unsafe type casts.
// ---------------------------------------------------------------------------

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type FetchMock = ReturnType<typeof vi.fn<FetchFn>>;

function stubFetch(impl: FetchFn): FetchMock {
  const fn: FetchMock = vi.fn<FetchFn>(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function mockFetchOk<T>(body: T): FetchMock {
  return stubFetch(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
  );
}

export function mockFetchRestError(
  message: string,
  httpStatus = 400,
  code = 'BAD_REQUEST'
): FetchMock {
  return stubFetch(
    async () =>
      new Response(JSON.stringify({ message, code }), {
        status: httpStatus,
        headers: { 'content-type': 'application/json' },
      })
  );
}

export function mockFetchUnreachable(): FetchMock {
  return stubFetch(async () => {
    throw new TypeError('fetch failed');
  });
}

/**
 * Safely extract a single fetch call so tests don't reach into
 * `mock.calls[0]` directly. Asserts the spy was called exactly once and
 * returns a typed view of the URL string and request init the CLI sent.
 */
export function getFetchCall(spy: FetchMock, index = 0): { url: string; init: RequestInit } {
  expect(spy).toHaveBeenCalled();
  const call = spy.mock.calls[index];
  if (!call) throw new Error(`fetch call #${index} not recorded`);
  const [input, init] = call;
  const url = typeof input === 'string' ? input : input.toString();
  return { url, init: init ?? {} };
}

/** Parse the JSON body the CLI sent on a recorded fetch call. */
export function getFetchJson(spy: FetchMock, index = 0): unknown {
  const { init } = getFetchCall(spy, index);
  const body = init.body;
  if (typeof body !== 'string') throw new Error('fetch body was not a string');
  return JSON.parse(body);
}
