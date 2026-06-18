import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';

import type { TRPCLink } from '@trpc/client';

import type { AppRouter } from '@pops/api-client';

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
 * Legacy pops-api URL — every pillar has migrated to REST, so no namespace
 * gets a dedicated `/trpc-<pillar>` batch URL anymore. The handful of
 * procedures the REST cutover has not yet absorbed (global search, the
 * nudge bell) still flow through the monolith's `/trpc` catch-all.
 */
const LEGACY_TRPC_URL = '/trpc';

const MAX_URL_LENGTH = 2083;

function terminalLink(): TRPCLink<AppRouter> {
  return httpBatchLink<AppRouter>({
    url: LEGACY_TRPC_URL,
    maxURLLength: MAX_URL_LENGTH,
    fetch: fetchWithTimeout,
  });
}

/**
 * tRPC client instance pointing every remaining procedure at the legacy
 * `/trpc` endpoint on the monolith.
 */
export const trpcClient = trpc.createClient({
  links: [terminalLink()],
});
