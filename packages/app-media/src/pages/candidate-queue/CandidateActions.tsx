import { Ban, Download, RotateCcw } from 'lucide-react';

import { Button, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import type { Candidate } from './CandidateCard';
import type { useCardMutations } from './useCardMutations';

type Mutations = ReturnType<typeof useCardMutations>;

function ExcludePopover({
  candidate,
  excludeMutation,
  popoverOpen,
  setPopoverOpen,
  excludeReason,
  setExcludeReason,
}: {
  candidate: Candidate;
  excludeMutation: Mutations['excludeMutation'];
  popoverOpen: boolean;
  setPopoverOpen: (v: boolean) => void;
  excludeReason: string;
  setExcludeReason: (v: string) => void;
}) {
  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={excludeMutation.isPending} title="Exclude">
          <Ban className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2" align="end">
        <p className="text-sm font-medium">Exclude this movie?</p>
        <input
          className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
          placeholder="Reason (optional)"
          value={excludeReason}
          onChange={(e) => setExcludeReason(e.target.value)}
        />
        <Button
          size="sm"
          onClick={() =>
            excludeMutation.mutate({
              tmdbId: candidate.tmdbId,
              title: candidate.title,
              reason: excludeReason || undefined,
            })
          }
          disabled={excludeMutation.isPending}
        >
          Confirm
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function PendingActions({
  candidate,
  downloadMutation,
  excludeMutation,
  popoverOpen,
  setPopoverOpen,
  excludeReason,
  setExcludeReason,
}: {
  candidate: Candidate;
  downloadMutation: Mutations['downloadMutation'];
  excludeMutation: Mutations['excludeMutation'];
  popoverOpen: boolean;
  setPopoverOpen: (v: boolean) => void;
  excludeReason: string;
  setExcludeReason: (v: string) => void;
}) {
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => downloadMutation.mutate({ candidateId: candidate.id })}
        disabled={downloadMutation.isPending}
        title="Download via Radarr"
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
      <ExcludePopover
        candidate={candidate}
        excludeMutation={excludeMutation}
        popoverOpen={popoverOpen}
        setPopoverOpen={setPopoverOpen}
        excludeReason={excludeReason}
        setExcludeReason={setExcludeReason}
      />
    </>
  );
}

export function ExcludedActions({
  candidate,
  unexcludeMutation,
}: {
  candidate: Candidate;
  unexcludeMutation: Mutations['unexcludeMutation'];
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => unexcludeMutation.mutate({ tmdbId: candidate.tmdbId })}
      disabled={unexcludeMutation.isPending}
      title="Restore to queue"
    >
      <RotateCcw className="h-3.5 w-3.5" />
    </Button>
  );
}
