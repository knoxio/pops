/**
 * NudgesPage — notification panel for cerebrum nudges (#2244).
 *
 * Displays pending nudges with dismiss/act actions, fetched from
 * `POST /nudges/search` on the cerebrum REST surface.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ButtonPrimitive } from '@pops/ui';

import { nudgesAct, nudgesDismiss, nudgesList } from '../cerebrum-api';
import { unwrap } from '../cerebrum-api-helpers';
import { ContradictionsPanel } from '../components/ContradictionsPanel';
import { NudgeCard } from '../components/NudgeCard';

function useNudgeMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['cerebrum', 'nudges'] });
  const dismissMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => unwrap(await nudgesDismiss({ path: { id } })),
    onSuccess: invalidate,
  });
  const actMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => unwrap(await nudgesAct({ path: { id } })),
    onSuccess: invalidate,
  });
  return { dismissMutation, actMutation };
}

export function NudgesPage() {
  const nudgesInput = { status: 'pending', limit: 50 } as const;
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['cerebrum', 'nudges', 'list', nudgesInput],
    queryFn: async () => unwrap(await nudgesList({ body: nudgesInput })),
  });

  const { dismissMutation, actMutation } = useNudgeMutations();

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading nudges...</div>;
  }

  if (isError) {
    const message =
      (error as { message?: string } | null)?.message ?? 'An unexpected error occurred.';
    return (
      <div className="p-6 text-center" data-testid="nudges-error">
        <p className="text-destructive mb-3">Failed to load nudges. {message}</p>
        <ButtonPrimitive variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </ButtonPrimitive>
      </div>
    );
  }

  const nudges = data?.nudges ?? [];

  if (nudges.length === 0) {
    return (
      <div className="p-4 md:p-6 space-y-6 max-w-3xl">
        <div className="p-6 text-center text-muted-foreground">
          No pending nudges. Everything looks good.
        </div>
        <ContradictionsPanel />
      </div>
    );
  }

  const isPending = actMutation.isPending || dismissMutation.isPending;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <div className="space-y-3">
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
      <ContradictionsPanel />
    </div>
  );
}
