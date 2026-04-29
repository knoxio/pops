/**
 * NudgeIndicator — notification bell showing pending nudge count (#2244).
 *
 * Polls the nudges.list endpoint and displays a badge on the bell icon
 * when there are pending nudges. Clicking navigates to the cerebrum nudges page.
 */
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router';

import { trpc } from '@pops/api-client';
import { Button } from '@pops/ui';

const POLL_BASE_MS = 60_000;
const MAX_FAILURES = 5;

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

export function NudgeIndicator() {
  const navigate = useNavigate();
  const { data } = trpc.cerebrum.nudges.list.useQuery(
    { status: 'pending', limit: 1 },
    { retry: false, staleTime: 30_000, refetchInterval: nudgeRefetchInterval }
  );

  const pendingCount = data?.total ?? 0;

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
