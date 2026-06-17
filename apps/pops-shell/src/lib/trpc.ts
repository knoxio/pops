import { httpBatchLink, splitLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';

import { TRPC_PILLARS, type TrpcPillarId } from '@pops/pillar-sdk/capabilities';

import type { Operation, TRPCLink } from '@trpc/client';

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
 * tRPC URL prefix per pillar. Each pillar's API serves at its own URL so
 * nginx can do a simple prefix match (no regex on procedure paths) and so
 * the client batcher never assembles a batch URL targeting more than one
 * pillar at a time.
 */
const PILLAR_TRPC_URLS: Readonly<Record<TrpcPillarId, string>> = {
  core: '/trpc-core',
  media: '/trpc-media',
  cerebrum: '/trpc-cerebrum',
  food: '/trpc-food',
};

/** Legacy pops-api URL — catches every procedure that isn't pillar-prefixed. */
const LEGACY_TRPC_URL = '/trpc';

const MAX_URL_LENGTH = 2083;

const PILLAR_SET: ReadonlySet<string> = new Set(TRPC_PILLARS);

function isTrpcPillarId(value: string): value is TrpcPillarId {
  return PILLAR_SET.has(value);
}

function pillarOfPath(path: string): TrpcPillarId | null {
  const namespace = path.split('.')[0];
  if (!namespace) return null;
  return isTrpcPillarId(namespace) ? namespace : null;
}

function terminalLinkFor(url: string): TRPCLink<AppRouter> {
  return httpBatchLink<AppRouter>({
    url,
    maxURLLength: MAX_URL_LENGTH,
    fetch: fetchWithTimeout,
  });
}

/**
 * Builds a tRPC link that dispatches each operation to the per-pillar batch
 * link matching its namespace, falling back to the legacy URL for anything
 * else. tRPC's `splitLink` is binary, so the chain is nested once per pillar.
 *
 * Per-pillar links share no batch buffer: a request graph that mixes
 * `core.foo` and `finance.bar` always produces two separate HTTP calls.
 */
function createPillarSplitLink(): TRPCLink<AppRouter> {
  const legacyLink = terminalLinkFor(LEGACY_TRPC_URL);
  return TRPC_PILLARS.reduce<TRPCLink<AppRouter>>((falseBranch, pillar) => {
    const pillarLink = terminalLinkFor(PILLAR_TRPC_URLS[pillar]);
    return splitLink<AppRouter>({
      condition: (op: Operation) => pillarOfPath(op.path) === pillar,
      true: pillarLink,
      false: falseBranch,
    });
  }, legacyLink);
}

/**
 * tRPC client instance with a per-pillar splitLink (PRD-187).
 *
 * Each pillar's procedures route to their own batched URL
 * (`/trpc-<pillar>`); non-pillar procedures keep flowing to the legacy
 * `/trpc` endpoint. No batch URL ever spans more than one pillar.
 */
export const trpcClient = trpc.createClient({
  links: [createPillarSplitLink()],
});
