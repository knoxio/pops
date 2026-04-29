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

export function NudgeIndicator() {
  const navigate = useNavigate();
  const { data } = trpc.cerebrum.nudges.list.useQuery(
    { status: 'pending', limit: 1 },
    {
      retry: false,
      staleTime: 30_000,
      // Back off exponentially on consecutive errors; give up after 5 failures
      // to avoid spamming a persistently-broken endpoint (e.g. missing table).
      refetchInterval: (query) => {
        const errors = query.state.errorUpdateCount;
        if (errors >= 5) return false;
        if (errors >= 3) return 5 * 60_000;
        return 60_000;
      },
    }
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
