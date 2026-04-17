import {
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Circle,
  ImageOff,
  Minus,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

/**
 * Debrief page — post-watch comparison flow for a debrief session.
 *
 * Route: /media/debrief/:movieId
 *
 * Shows movie poster header, dimension progress tracker, and comparison
 * cards with Pick A / Pick B / draw-tier buttons. Uses getDebrief query
 * and recordDebriefComparison mutation. Advances through pending
 * dimensions; shows CompletionSummary when all are done.
 */
import { Badge, Button, Skeleton, Tooltip, TooltipContent, TooltipTrigger } from '@pops/ui';

import { DebriefActionBar } from '../components/DebriefControls';
import { trpc } from '../lib/trpc';

export function DebriefPage() {
  const { movieId: rawId } = useParams<{ movieId: string }>();
  const movieId = Number(rawId);
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const {
    data: debriefData,
    isLoading,
    error,
    refetch,
  } = trpc.media.comparisons.getDebrief.useQuery(
    { mediaType: 'movie', mediaId: movieId },
    { enabled: !Number.isNaN(movieId) && movieId > 0 }
  );

  const debrief = debriefData?.data;
  const sessionId = debrief?.sessionId;

  // Track which pending dimension the user is currently on
  const pendingDimensions = debrief?.dimensions.filter((d) => d.status === 'pending') ?? [];
  const allComplete = debrief ? pendingDimensions.length === 0 : false;

  // Always show first pending dimension
  const currentDimension = pendingDimensions[0] ?? null;

  // Record debrief comparison mutation
  const recordMutation = trpc.media.comparisons.recordDebriefComparison.useMutation({
    onSuccess: (result) => {
      if (result.data.sessionComplete) {
        toast.success('Debrief complete!');
      } else {
        toast.success('Comparison recorded');
      }
      void utils.media.comparisons.getDebrief.invalidate({ mediaType: 'movie', mediaId: movieId });
      void utils.media.comparisons.getPendingDebriefs.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handlePick = (winnerId: number) => {
    if (!currentDimension || !debrief || !sessionId || recordMutation.isPending) return;

    recordMutation.mutate({
      sessionId,
      dimensionId: currentDimension.dimensionId,
      opponentType: 'movie' as const,
      opponentId: currentDimension.opponent!.id,
      winnerId,
    });
  };

  const handleDraw = (tier: 'high' | 'mid' | 'low') => {
    if (!currentDimension || !debrief || !sessionId || recordMutation.isPending) return;

    recordMutation.mutate({
      sessionId,
      dimensionId: currentDimension.dimensionId,
      opponentType: 'movie' as const,
      opponentId: currentDimension.opponent!.id,
      winnerId: 0,
      drawTier: tier,
    });
  };

  const handleDimensionSkipped = () => {
    void utils.media.comparisons.getDebrief.invalidate({ mediaType: 'movie', mediaId: movieId });
  };

  const handleDoAnother = () => {
    navigate('/media/history');
  };

  // ── Loading / Error states ──

  if (Number.isNaN(movieId) || movieId <= 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>Invalid movie ID.</p>
        <Link to="/media" className="text-primary underline">
          Back to library
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6" data-testid="debrief-loading">
        <Skeleton className="h-8 w-48" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-36 w-24 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-16" />
        </div>
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="aspect-[2/3] w-full rounded-md" />
          <Skeleton className="aspect-[2/3] w-full rounded-md" />
        </div>
      </div>
    );
  }

  if (error || !debrief) {
    return (
      <div className="p-6 text-center text-muted-foreground" data-testid="debrief-error">
        <p className="mb-2 text-lg">Could not load debrief</p>
        <p className="text-sm">
          {error?.message ?? 'Session not found'}{' '}
          <button onClick={() => refetch()} className="text-primary underline">
            Try again
          </button>
        </p>
      </div>
    );
  }

  // ── Summary data for CompletionSummary ──
  const summaryData = allComplete
    ? {
        sessionId: debrief.sessionId,
        movieTitle: debrief.movie.title,
        dimensions: debrief.dimensions.map((d) => ({
          dimensionId: d.dimensionId,
          name: d.name,
          status: d.status,
          comparisonId: d.comparisonId,
        })),
      }
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Back link */}
      <Link
        to="/media/history"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to history
      </Link>

      {/* ── Poster header ── */}
      <div className="flex items-center gap-4" data-testid="debrief-header">
        <PosterImage
          src={debrief.movie.posterUrl}
          alt={`${debrief.movie.title} poster`}
          className="h-36 w-24 shrink-0 rounded-md object-cover"
        />
        <div>
          <h1 className="text-2xl font-bold">{debrief.movie.title}</h1>
          <p className="text-muted-foreground text-sm">
            Debrief —{' '}
            {allComplete
              ? 'Complete'
              : `${pendingDimensions.length} dimension${pendingDimensions.length !== 1 ? 's' : ''} remaining`}
          </p>
        </div>
      </div>

      {/* ── Dimension progress tracker ── */}
      <div className="flex flex-wrap gap-2" data-testid="dimension-progress">
        {debrief.dimensions.map((dim) => (
          <Badge
            key={dim.dimensionId}
            variant={
              dim.status === 'complete'
                ? 'default'
                : currentDimension?.dimensionId === dim.dimensionId
                  ? 'outline'
                  : 'secondary'
            }
            className="gap-1"
          >
            {dim.status === 'complete' ? (
              <CheckCircle className="h-3 w-3" />
            ) : (
              <Circle className="h-3 w-3" />
            )}
            {dim.name}
          </Badge>
        ))}
      </div>

      {/* ── Comparison cards or completion ── */}
      {!allComplete && currentDimension ? (
        <>
          {currentDimension.opponent ? (
            <>
              <p className="text-muted-foreground text-center text-sm">
                Which has better{' '}
                <span className="text-foreground font-medium">{currentDimension.name}</span>?
              </p>

              <div className="relative grid grid-cols-2 gap-6" data-testid="comparison-cards">
                {/* Movie A (the debrief movie) */}
                <ComparisonCard
                  movie={{
                    id: debrief.movie.mediaId,
                    title: debrief.movie.title,
                    posterUrl: debrief.movie.posterUrl,
                  }}
                  onPick={() => {
                    handlePick(debrief.movie.mediaId);
                  }}
                  disabled={recordMutation.isPending}
                  testId="pick-a"
                />

                {/* Draw tier buttons — centered between cards */}
                <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-1.5">
                  {[
                    {
                      tier: 'high' as const,
                      icon: ChevronUp,
                      label: 'Equally great',
                      color: 'hover:border-success hover:text-success',
                    },
                    {
                      tier: 'mid' as const,
                      icon: Minus,
                      label: 'Equally average',
                      color: 'hover:border-muted-foreground',
                    },
                    {
                      tier: 'low' as const,
                      icon: ChevronDown,
                      label: 'Equally poor',
                      color: 'hover:border-destructive hover:text-destructive',
                    },
                  ].map(({ tier, icon: Icon, label, color }) => (
                    <Tooltip key={tier}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            handleDraw(tier);
                          }}
                          disabled={recordMutation.isPending}
                          className={`bg-background h-10 w-10 rounded-full shadow-lg hover:scale-110 hover:shadow-xl active:scale-95 ${color}`}
                          aria-label={label}
                          data-testid={`draw-${tier}`}
                        >
                          <Icon className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">{label}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>

                {/* Movie B (opponent) */}
                <ComparisonCard
                  movie={{
                    id: currentDimension.opponent.id,
                    title: currentDimension.opponent.title,
                    posterUrl: currentDimension.opponent.posterUrl ?? null,
                  }}
                  onPick={() => {
                    handlePick(currentDimension.opponent!.id);
                  }}
                  disabled={recordMutation.isPending}
                  testId="pick-b"
                />
              </div>
            </>
          ) : (
            <div className="text-muted-foreground py-8 text-center">
              <p>No opponent available for {currentDimension.name}.</p>
              <p className="text-sm">Skip this dimension to continue.</p>
            </div>
          )}
        </>
      ) : null}

      {/* ── Action bar (skip/bail/completion) ── */}
      <div className="flex justify-center">
        <DebriefActionBar
          sessionId={debrief.sessionId}
          currentDimension={
            currentDimension
              ? { id: currentDimension.dimensionId, name: currentDimension.name }
              : null
          }
          allComplete={allComplete}
          summaryData={summaryData}
          onDimensionSkipped={handleDimensionSkipped}
          onDoAnother={handleDoAnother}
        />
      </div>
    </div>
  );
}

// ── Sub-components ──

function PosterImage({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);

  if (!src || imgError) {
    return (
      <div className={`bg-muted flex items-center justify-center ${className ?? ''}`}>
        <ImageOff className="text-muted-foreground h-8 w-8" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        setImgError(true);
      }}
    />
  );
}

function ComparisonCard({
  movie,
  onPick,
  disabled,
  testId,
}: {
  movie: { id: number; title: string; posterUrl: string | null };
  onPick: () => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <button
      onClick={onPick}
      disabled={disabled}
      className={`flex flex-col items-center rounded-lg border p-4 text-center transition-all ${
        disabled
          ? 'cursor-default'
          : 'hover:border-primary hover:shadow-lg hover:scale-[1.02] cursor-pointer active:scale-[0.98]'
      }`}
      data-testid={testId}
    >
      <PosterImage
        src={movie.posterUrl}
        alt={`${movie.title} poster`}
        className="mb-3 aspect-[2/3] w-full rounded-md object-cover"
      />
      <h3 className="text-sm font-semibold">{movie.title}</h3>
    </button>
  );
}
