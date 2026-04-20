import { Ban, Check, Loader2, X } from 'lucide-react';

import { Button } from '@pops/ui';

interface MutationLike {
  isPending: boolean;
  mutate: (input: { tmdbId: number }) => void;
}

interface StatusBtnProps {
  tmdbId: number;
  variant: 'standard' | 'compact';
  mutation: MutationLike;
}

export function ExcludedButton({ tmdbId, variant, mutation }: StatusBtnProps) {
  if (variant === 'compact') {
    return (
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-amber-500 hover:bg-amber-500/20"
        onClick={() => mutation.mutate({ tmdbId })}
        disabled={mutation.isPending}
        title="Excluded — click to un-exclude"
        aria-label="Un-exclude movie"
      >
        {mutation.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Ban className="h-3.5 w-3.5" />
        )}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      className="text-amber-500 border-amber-500/50"
      onClick={() => mutation.mutate({ tmdbId })}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Ban className="h-4 w-4" />
      )}
      Excluded
    </Button>
  );
}

export function InQueueButton({ tmdbId, variant, mutation }: StatusBtnProps) {
  if (variant === 'compact') {
    return (
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-success hover:bg-destructive/20 hover:text-destructive/80"
        onClick={() => mutation.mutate({ tmdbId })}
        disabled={mutation.isPending}
        title="In Queue — click to remove"
        aria-label="Remove from queue"
      >
        {mutation.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      className="group text-success border-success/50 hover:text-destructive/80 hover:border-destructive/50"
      onClick={() => mutation.mutate({ tmdbId })}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <Check className="h-4 w-4 group-hover:hidden" />
          <X className="h-4 w-4 hidden group-hover:inline" />
        </>
      )}
      In Queue
    </Button>
  );
}
