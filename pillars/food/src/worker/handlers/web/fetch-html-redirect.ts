/**
 * Redirect-loop helpers for the HTML fetcher.
 */

const USER_AGENT =
  'Mozilla/5.0 (compatible; POPS-Food-Ingest/1.0; +https://github.com/knoxio/pops)';

export interface ResolvedFetchOptions {
  fetchImpl: typeof fetch;
  timeoutMs: number;
  maxRedirects: number;
  maxBodyBytes: number;
}

export interface FollowOk {
  tag: 'ok';
  response: Response;
  currentUrl: string;
}
export interface FollowFail {
  tag: 'failed';
  errorCode: 'FetchFailed' | 'FetchTimeout';
  errorMessage: string;
  status?: number;
  finalUrl?: string;
  durationMs: number;
}

export type FollowResult = FollowOk | FollowFail;

export async function followRedirects(
  url: string,
  opts: ResolvedFetchOptions,
  start: number
): Promise<FollowResult> {
  let currentUrl = url;
  for (let hop = 0; hop <= opts.maxRedirects; hop += 1) {
    const fetched = await safeFetch(currentUrl, opts, start);
    if (fetched.tag === 'failed') return fetched;
    const res = fetched.response;
    if (res.status < 300 || res.status >= 400) {
      return { tag: 'ok', response: res, currentUrl };
    }
    const next = readRedirectTarget({
      res,
      currentUrl,
      hop,
      maxRedirects: opts.maxRedirects,
      start,
    });
    // Drain the 3xx body so Undici can return the socket to its keep-alive
    // pool — leaving redirect bodies unconsumed leaks connections under load.
    await drainBody(res);
    if (next.tag === 'failed') return next;
    currentUrl = next.url;
  }
  return {
    tag: 'failed',
    errorCode: 'FetchFailed',
    errorMessage: 'no response after redirect chain',
    durationMs: Date.now() - start,
  };
}

async function safeFetch(
  url: string,
  opts: ResolvedFetchOptions,
  start: number
): Promise<{ tag: 'ok'; response: Response } | FollowFail> {
  try {
    const response = await opts.fetchImpl(url, {
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    return { tag: 'ok', response };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    return {
      tag: 'failed',
      errorCode: isTimeout ? 'FetchTimeout' : 'FetchFailed',
      errorMessage: message,
      durationMs: Date.now() - start,
    };
  }
}

interface RedirectTargetArgs {
  res: Response;
  currentUrl: string;
  hop: number;
  maxRedirects: number;
  start: number;
}

async function drainBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    /* nothing to do — the body may already be consumed or detached */
  }
}

function readRedirectTarget(args: RedirectTargetArgs): { tag: 'ok'; url: string } | FollowFail {
  const { res, currentUrl, hop, maxRedirects, start } = args;
  const location = res.headers.get('location');
  if (location === null || location === '') {
    return {
      tag: 'failed',
      errorCode: 'FetchFailed',
      errorMessage: `redirect ${res.status} without Location header`,
      status: res.status,
      finalUrl: currentUrl,
      durationMs: Date.now() - start,
    };
  }
  if (hop === maxRedirects) {
    return {
      tag: 'failed',
      errorCode: 'FetchFailed',
      errorMessage: `exceeded ${maxRedirects} redirect hops`,
      status: res.status,
      finalUrl: currentUrl,
      durationMs: Date.now() - start,
    };
  }
  return { tag: 'ok', url: new URL(location, currentUrl).toString() };
}
