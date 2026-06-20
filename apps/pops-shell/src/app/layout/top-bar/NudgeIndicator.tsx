/**
 * NudgeIndicator — notification bell showing pending nudge count (#2244).
 *
 * Polls the cerebrum pillar's `POST /nudges/search` REST endpoint (opId
 * `nudges.list`) through the shell's `/cerebrum-api` proxy and displays a
 * badge on the bell icon when there are pending nudges. Clicking navigates
 * to the cerebrum nudges page.
 *
 * The proxy (vite in dev, nginx in prod) strips the `/cerebrum-api` prefix
 * so the pillar sees `/nudges/search`. Mirrors the federated-search surface
 * (`@pops/navigation` useSearchInputData → `/orchestrator-api/search`): a
 * plain `fetch` + React Query, no tRPC and no pillar-sdk transport.
 */
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router';

import { Button } from '@pops/ui';

const POLL_BASE_MS = 60_000;
const MAX_FAILURES = 5;

/**
 * Shell path the dev Vite proxy / production nginx rewrites onto the cerebrum
 * pillar's nudges list (`POST /nudges/search`). The proxy strips the
 * `/cerebrum-api` prefix so the pillar sees `/nudges/search`.
 */
const NUDGES_SEARCH_URL = '/cerebrum-api/nudges/search';

/** Failure carrying the HTTP status so the bell can hide on 404 / unavailable. */
class NudgeFetchError extends Error {
  constructor(readonly status: number | undefined) {
    super(`nudges fetch failed: ${status ?? 'network'}`);
    this.name = 'NudgeFetchError';
  }
}

/**
 * Exponential backoff for the nudges poller.
 * Uses fetchFailureCount (resets to 0 on success) so the interval recovers
 * automatically after the endpoint starts returning 200s.
 * Intervals: 60s → 2m → 4m → 8m → 16m → stop.
 */
export function nudgeRefetchInterval(query: {
  state: { fetchFailureCount: number };
}): number | false {
  const failures = query.state.fetchFailureCount;
  if (failures >= MAX_FAILURES) return false;
  return POLL_BASE_MS * 2 ** failures;
}

function parsePendingTotal(value: unknown): number {
  if (typeof value === 'object' && value !== null) {
    const total = (value as { total?: unknown }).total;
    if (typeof total === 'number') return total;
  }
  throw new NudgeFetchError(undefined);
}

async function fetchPendingCount(signal: AbortSignal): Promise<number> {
  const response = await fetch(NUDGES_SEARCH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'pending', limit: 1 }),
    signal,
  });
  if (!response.ok) throw new NudgeFetchError(response.status);
  return parsePendingTotal(await response.json());
}

export function NudgeIndicator() {
  const navigate = useNavigate();
  const { data, isError } = useQuery({
    queryKey: ['cerebrum', 'nudges', 'list', { status: 'pending', limit: 1 }],
    queryFn: ({ signal }) => fetchPendingCount(signal),
    retry: false,
    staleTime: 30_000,
    refetchInterval: nudgeRefetchInterval,
  });

  // Hide the bell when cerebrum is unreachable / not-found rather than render a
  // broken indicator (matches the previous pillar-sdk hidden-on-unavailable UX).
  if (isError) return null;

  const pendingCount = data ?? 0;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative min-w-[44px] min-h-[44px]"
      aria-label={`Nudges: ${pendingCount} pending`}
      onClick={() => navigate('/cerebrum/nudges')}
    >
      <Bell className="h-5 w-5" />
      {pendingCount > 0 && (
        <span className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
          {pendingCount > 99 ? '99+' : pendingCount}
        </span>
      )}
    </Button>
  );
}
