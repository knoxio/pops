import { createTRPCReact } from '@trpc/react-query';

import { createPillarSplitLink } from './split-link.js';

/**
 * Shared tRPC client for all app packages.
 *
 * This is the single createTRPCReact instance that every package
 * imports from. The shell owns the Provider; app packages just
 * consume the hooks.
 */
import type { AppRouter } from './app-router.js';

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
 * tRPC client instance with a per-pillar splitLink (PRD-187).
 *
 * Each pillar's procedures route to their own batched URL
 * (`/trpc-<pillar>`); non-pillar procedures keep flowing to the legacy
 * `/trpc` endpoint. No batch URL ever spans more than one pillar, so the
 * legacy nginx procedure-path regex rules can be retired once PRD-190
 * lands.
 */
export const trpcClient = trpc.createClient({
  links: [
    createPillarSplitLink({
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

export type { AppRouter } from './app-router.js';

export {
  CrossPillarBatchError,
  LEGACY_BATCH_TARGET,
  assertSingleTargetBatch,
  batchTargetOfPath,
  checkSingleTargetBatch,
} from './batching-invariants.js';
export type {
  BatchInvariantViolation,
  BatchTarget,
  BatchableOp,
  LegacyBatchTarget,
} from './batching-invariants.js';
export {
  createPillarSplitLink,
  pillarOfPath,
  PILLAR_TRPC_URLS,
  LEGACY_TRPC_URL,
} from './split-link.js';
export type { CreateSplitLinkOptions, TerminalLinkFactory } from './split-link.js';
