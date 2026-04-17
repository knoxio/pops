/**
 * DebriefComparisonCard — two movie posters side by side for debrief comparison.
 * User taps one to select the winner. Calls recordDebriefComparison mutation,
 * then fires onResult with the outcome.
 */
import { Skeleton } from '@pops/ui';
import { ImageOff } from 'lucide-react';
import { useState } from 'react';

import { trpc } from '../lib/trpc';

export interface DebriefMovie {
  id: number;
  title: string;
  year?: string | number | null;
  posterUrl: string | null;
}

export interface DebriefComparisonCardProps {
  /** The movie being debriefed (just watched). */
  movieA: DebriefMovie;
  /** The opponent movie (median-score match). */
  movieB: DebriefMovie;
  /** Which comparison dimension this is for. */
  dimensionId: number;
  /** The debrief session ID. */
  sessionId: number;
  /** Called after comparison is recorded. */
  onResult: (result: { comparisonId: number | null; sessionComplete: boolean }) => void;
}

export function DebriefComparisonCard({
  movieA,
  movieB,
  dimensionId,
  sessionId,
  onResult,
}: DebriefComparisonCardProps) {
  const [winnerId, setWinnerId] = useState<number | null>(null);

  const mutation = trpc.media.comparisons.recordDebriefComparison.useMutation({
    onSuccess: (data) => {
      onResult(data.data);
    },
  });

  const disabled = mutation.isPending || winnerId !== null;

  const handlePick = (pickedId: number) => {
    if (disabled) return;
    setWinnerId(pickedId);
    mutation.mutate({
      sessionId,
      dimensionId,
      opponentType: 'movie' as const,
      opponentId: movieB.id,
      winnerId: pickedId,
    });
  };

  return (
    <div className="grid grid-cols-2 gap-4" data-testid="debrief-comparison-card">
      <PosterCard
        movie={movieA}
        onPick={() => handlePick(movieA.id)}
        disabled={disabled}
        isWinner={winnerId === movieA.id}
        isLoser={winnerId !== null && winnerId !== movieA.id}
      />
      <PosterCard
        movie={movieB}
        onPick={() => handlePick(movieB.id)}
        disabled={disabled}
        isWinner={winnerId === movieB.id}
        isLoser={winnerId !== null && winnerId !== movieB.id}
      />
    </div>
  );
}

function PosterCard({
  movie,
  onPick,
  disabled,
  isWinner,
  isLoser,
}: {
  movie: DebriefMovie;
  onPick: () => void;
  disabled: boolean;
  isWinner: boolean;
  isLoser: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const posterSrc = movie.posterUrl ?? undefined;

  const year =
    movie.year != null
      ? typeof movie.year === 'string'
        ? movie.year.slice(0, 4)
        : movie.year
      : null;

  return (
    <button
      onClick={onPick}
      disabled={disabled}
      aria-label={`Pick ${movie.title}`}
      className={`flex flex-col items-center text-center rounded-lg border p-3 transition-all ${
        isWinner
          ? 'border-success shadow-lg scale-[1.02]'
          : isLoser
            ? 'border-destructive/50 opacity-60'
            : 'border-border hover:border-primary hover:shadow-md hover:scale-[1.01]'
      } ${disabled && !isWinner && !isLoser ? 'cursor-default' : !disabled ? 'cursor-pointer active:scale-[0.98]' : ''}`}
    >
      {imgError || !posterSrc ? (
        <div className="w-full aspect-[2/3] rounded-md mb-2 bg-muted flex items-center justify-center">
          <ImageOff className="h-8 w-8 text-muted-foreground" />
        </div>
      ) : (
        <img
          src={posterSrc}
          alt={`${movie.title} poster`}
          className="w-full aspect-[2/3] rounded-md object-cover mb-2"
          onError={() => setImgError(true)}
        />
      )}
      <h3 className="font-semibold text-sm leading-tight line-clamp-2">{movie.title}</h3>
      {year && <p className="text-xs text-muted-foreground mt-0.5">{year}</p>}
    </button>
  );
}

export function DebriefComparisonCardSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex flex-col items-center rounded-lg border border-border p-3">
        <Skeleton className="w-full aspect-[2/3] rounded-md mb-2" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex flex-col items-center rounded-lg border border-border p-3">
        <Skeleton className="w-full aspect-[2/3] rounded-md mb-2" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  );
}

DebriefComparisonCard.displayName = 'DebriefComparisonCard';
