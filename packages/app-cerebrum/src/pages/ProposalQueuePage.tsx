/**
 * ProposalQueuePage — React UI for pending glia proposals (#2246).
 *
 * Shows pending glia actions with approve/reject/modify controls.
 * Fetches from glia.actions.list tRPC endpoint.
 */
import { useState } from 'react';

import { trpc } from '@pops/api-client';
import { Button } from '@pops/ui';

type Decision = 'approve' | 'reject' | 'modify';

export function ProposalQueuePage() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.cerebrum.glia.actions.list.useQuery({
    status: 'pending',
    limit: 50,
  });

  const decideMutation = trpc.cerebrum.glia.actions.decide.useMutation({
    onSuccess: () => utils.cerebrum.glia.actions.list.invalidate(),
  });

  const [noteState, setNoteState] = useState<Record<string, string>>({});

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading proposals...</div>;
  }

  const actions = data?.actions ?? [];

  if (actions.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No pending proposals. Glia is idle.
      </div>
    );
  }

  function handleDecide(id: string, decision: Decision) {
    const note = noteState[id];
    decideMutation.mutate({ id, decision, note: note ?? undefined });
  }

  return (
    <div className="p-4 md:p-6 space-y-3 max-w-3xl">
      <h2 className="text-lg font-semibold mb-4">Proposal Queue ({data?.total ?? 0})</h2>
      {actions.map((action) => (
        <ProposalCard
          key={action.id}
          action={action}
          note={noteState[action.id] ?? ''}
          onNoteChange={(val) => setNoteState((s) => ({ ...s, [action.id]: val }))}
          onDecide={(decision) => handleDecide(action.id, decision)}
          isPending={decideMutation.isPending}
        />
      ))}
    </div>
  );
}

interface ProposalCardProps {
  action: {
    id: string;
    actionType: string;
    rationale: string;
    affectedIds: string[];
    createdAt: string;
  };
  note: string;
  onNoteChange: (val: string) => void;
  onDecide: (decision: Decision) => void;
  isPending: boolean;
}

function ProposalCard({ action, note, onNoteChange, onDecide, isPending }: ProposalCardProps) {
  return (
    <div className="border border-border rounded-lg p-4 bg-card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-mono text-muted-foreground">{action.id}</span>
          <h3 className="font-medium text-sm mt-0.5">{action.rationale}</h3>
        </div>
        <TypeBadge type={action.actionType} />
      </div>
      <div className="text-xs text-muted-foreground">Affects: {action.affectedIds.join(', ')}</div>
      <input
        type="text"
        placeholder="Optional note..."
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        className="w-full text-sm px-2 py-1 rounded border border-border bg-background"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onDecide('approve')} disabled={isPending}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onDecide('modify')}
          disabled={isPending}
        >
          Modify
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onDecide('reject')}
          disabled={isPending}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    prune: 'bg-amber-500/10 text-amber-400',
    consolidate: 'bg-sky-500/10 text-sky-400',
    link: 'bg-emerald-500/10 text-emerald-400',
    audit: 'bg-violet-500/10 text-violet-400',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full ${colors[type] ?? ''}`}>{type}</span>;
}
