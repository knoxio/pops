import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';

/**
 * Shared tRPC client for all app packages.
 *
 * This is the single createTRPCReact instance that every package
 * imports from. The shell owns the Provider; app packages just
 * consume the hooks.
 */
import type { AppRouter } from '@pops/api';

/** React Query hooks for tRPC — shared across all app packages. */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Without a timeout a hung backend leaves tRPC requests pending forever and
 * the UI stuck on skeleton loaders. 15s is long enough for slow queries but
 * short enough that the user notices something is wrong.
 */
export const TRPC_FETCH_TIMEOUT_MS = 15_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('timeout'), TRPC_FETCH_TIMEOUT_MS);

  // Chain the caller's signal (e.g. React Query cancellation) with our timeout
  // so aborting either source aborts the request. The listener is registered
  // with `once` and cleaned up explicitly in `finally` so a long-lived caller
  // signal doesn't accumulate listeners across requests.
  const callerSignal = init?.signal;
  const onCallerAbort = (): void => controller.abort(callerSignal?.reason);
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort(callerSignal.reason);
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  });
}

/**
 * tRPC client instance with httpBatchLink.
 * Batches multiple requests into a single HTTP call for better performance.
 * The shell passes this to <trpc.Provider>.
 */
export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: '/trpc', // Proxied by Vite to localhost:3000 in dev
      maxURLLength: 2083,
      fetch: fetchWithTimeout,
    }),
  ],
});

const NETWORK_ERROR_FRAGMENTS = [
  'Failed to fetch',
  'NetworkError',
  'Network request failed',
  'aborted',
  'timeout',
];

function messageLooksLikeNetworkFailure(err: object): boolean {
  if (!('message' in err) || typeof err.message !== 'string') return false;
  return NETWORK_ERROR_FRAGMENTS.some((fragment) => (err.message as string).includes(fragment));
}

/**
 * Heuristic: is this error a network/transport-level failure (server
 * unreachable, request aborted, fetch threw) rather than a tRPC error
 * returned by the server with a real status code?
 *
 * Server-returned errors have a `data` field with `httpStatus`. Network
 * failures don't make it that far — they bubble up as a TRPCClientError
 * wrapping a fetch error, an AbortError, or a `DOMException` (which is
 * not an `Error` subclass in browsers).
 */
export function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if ('data' in err && err.data != null) return false;
  if (messageLooksLikeNetworkFailure(err)) return true;
  // `DOMException` (Web abort errors) is not an `Error` subclass, so the
  // recursion needs to follow any throwable-shaped cause, not just `Error`.
  const cause = 'cause' in err ? err.cause : undefined;
  if (cause && typeof cause === 'object') return isNetworkError(cause);
  return false;
}

export type { AppRouter };
