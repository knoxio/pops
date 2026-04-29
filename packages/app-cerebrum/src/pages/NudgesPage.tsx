/**
 * NudgesPage — notification panel for cerebrum nudges (#2244).
 *
 * Displays pending nudges with dismiss/act actions. Fetched via
 * the existing nudges.list tRPC endpoint.
 */
import { trpc } from '@pops/api-client';

import { NudgeCard } from '../components/NudgeCard';

export function NudgesPage() {
  const utils = trpc.useUtils();
  const { data, isLoading, isError, error, refetch } = trpc.cerebrum.nudges.list.useQuery({
    status: 'pending',
    limit: 50,
  });

  const dismissMutation = trpc.cerebrum.nudges.dismiss.useMutation({
    onSuccess: () => utils.cerebrum.nudges.list.invalidate(),
  });
  const actMutation = trpc.cerebrum.nudges.act.useMutation({
    onSuccess: () => utils.cerebrum.nudges.list.invalidate(),
  });

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading nudges...</div>;
  }

  if (isError) {
    const message =
      (error as { message?: string } | null)?.message ?? 'An unexpected error occurred.';
    return (
      <div className="p-6 text-center" data-testid="nudges-error">
        <p className="text-destructive mb-3">Failed to load nudges. {message}</p>
        <button
          className="px-3 py-1.5 text-sm rounded border border-border bg-background hover:bg-muted"
          onClick={() => void refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  const nudges = data?.nudges ?? [];

  if (nudges.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No pending nudges. Everything looks good.
      </div>
    );
  }

  const isPending = actMutation.isPending || dismissMutation.isPending;

  return (
    <div className="p-4 md:p-6 space-y-3 max-w-3xl">
      <h2 className="text-lg font-semibold mb-4">Pending Nudges ({data?.total ?? 0})</h2>
      {nudges.map((nudge) => (
        <NudgeCard
          key={nudge.id}
          nudge={nudge}
          onAct={(id) => actMutation.mutate({ id })}
          onDismiss={(id) => dismissMutation.mutate({ id })}
          disabled={isPending}
        />
      ))}
    </div>
  );
}
