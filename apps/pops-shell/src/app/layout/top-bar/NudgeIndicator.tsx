import { trpc } from '@/lib/trpc';
/**
 * NudgeIndicator — notification bell showing pending nudge count (#2244).
 *
 * Polls the `cerebrum.nudges.list` procedure and displays a badge on the
 * bell icon when there are pending nudges. Clicking navigates to the
 * cerebrum nudges page.
 *
 * Routing: PRD-227 (US-02) keeps the SDK migration behind a runtime gate.
 * When a {@link PillarSdkProvider} is mounted above this component
 * (i.e. {@link usePillarSdkOptions} returns options with a `transport`
 * configured), this component uses {@link usePillarQuery} against the
 * cerebrum pillar. Otherwise — the current state of `pops-shell` on
 * `main` — it falls back to the existing tRPC query so the indicator
 * keeps working in the browser (the SDK's default registry URL points
 * at the container-network hostname, which is unreachable from a
 * browser).
 */
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router';

import { usePillarQuery, usePillarSdkOptions } from '@pops/pillar-sdk/react';
import { Button } from '@pops/ui';

const POLL_BASE_MS = 60_000;
const MAX_FAILURES = 5;

type NudgeListResult = { total: number };

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

function useSdkPendingCount(enabled: boolean): { pendingCount: number; hidden: boolean } {
  const { data, isUnavailable, isContractMismatch, isNotFound } = usePillarQuery<NudgeListResult>(
    'cerebrum',
    ['nudges', 'list'],
    { status: 'pending', limit: 1 },
    { retry: false, staleTime: 30_000, refetchInterval: nudgeRefetchInterval, enabled }
  );

  return {
    pendingCount: data?.total ?? 0,
    hidden: enabled && (isUnavailable || isContractMismatch || isNotFound),
  };
}

function useTrpcPendingCount(enabled: boolean): number {
  const { data } = trpc.cerebrum.nudges.list.useQuery(
    { status: 'pending', limit: 1 },
    { retry: false, staleTime: 30_000, refetchInterval: nudgeRefetchInterval, enabled }
  );
  return data?.total ?? 0;
}

export function NudgeIndicator() {
  const navigate = useNavigate();
  const sdkOptions = usePillarSdkOptions();
  const sdkEnabled = sdkOptions.transport !== undefined;

  const sdk = useSdkPendingCount(sdkEnabled);
  const trpcCount = useTrpcPendingCount(!sdkEnabled);

  if (sdk.hidden) return null;

  const pendingCount = sdkEnabled ? sdk.pendingCount : trpcCount;

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
