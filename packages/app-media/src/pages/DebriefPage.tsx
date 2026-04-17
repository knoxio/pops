import { CheckCircle, ChevronDown, ChevronUp, Circle, ImageOff, Minus } from 'lucide-react';
import { useCallback, useState } from 'react';
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
 *
 * Each comparison card exposes the same action overlay as the Arena:
 * watchlist toggle, mark stale, N/A exclusion, and blacklist (not watched).
 */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  PageHeader,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pops/ui';

import { ComparisonMovieCard } from '../components/ComparisonMovieCard';
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

  // ── Watchlist ──
  const { data: watchlistData } = trpc.media.watchlist.list.useQuery(
    { mediaType: 'movie' },
    { enabled: !!debrief }
  );

  const watchlistedMovies = new Map(
    (watchlistData?.data ?? [])
      .filter((e: { mediaType: string }) => e.mediaType === 'movie')
      .map((e: { mediaId: number; id: number }) => [e.mediaId, e.id])
  );

  const addToWatchlistMutation = trpc.media.watchlist.add.useMutation({
    onSuccess: (_data, variables) => {
      void utils.media.watchlist.list.invalidate();
      const title =
        variables.mediaId === debrief?.movie.mediaId
          ? (debrief?.movie.title ?? 'Movie')
          : (currentDimension?.opponent?.title ?? 'Movie');
      toast.success(`${title} added to watchlist`);
    },
  });

  const removeFromWatchlistMutation = trpc.media.watchlist.remove.useMutation({
    onSuccess: (_data, variables) => {
      void utils.media.watchlist.list.invalidate();
      const mediaId = [...watchlistedMovies.entries()].find(
        ([, entryId]) => entryId === variables.id
      )?.[0];
      const title =
        mediaId === debrief?.movie.mediaId
          ? (debrief?.movie.title ?? 'Movie')
          : (currentDimension?.opponent?.title ?? 'Movie');
      toast.success(`${title} removed from watchlist`);
    },
  });

  const handleToggleWatchlist = useCallback(
    (mediaId: number) => {
      const entryId = watchlistedMovies.get(mediaId);
      if (entryId !== undefined) {
        removeFromWatchlistMutation.mutate({ id: entryId });
      } else {
        addToWatchlistMutation.mutate({ mediaType: 'movie', mediaId });
      }
    },
    [watchlistedMovies, addToWatchlistMutation, removeFromWatchlistMutation]
  );

  // ── Mark stale ──
  const markStaleMutation = trpc.media.comparisons.markStale.useMutation({
    onSuccess: (data, variables) => {
      const title =
        variables.mediaId === debrief?.movie.mediaId
          ? (debrief?.movie.title ?? 'Movie')
          : (currentDimension?.opponent?.title ?? 'Movie');
      const staleness = data.data.staleness;
      const timesMarked = Math.round(Math.log(staleness) / Math.log(0.5));
      toast.success(`${title} marked stale (×${timesMarked})`);
      void utils.media.comparisons.getDebrief.invalidate({ mediaType: 'movie', mediaId: movieId });
    },
  });

  const handleMarkStale = useCallback(
    (mediaId: number) => {
      if (markStaleMutation.isPending) return;
      markStaleMutation.mutate({ mediaType: 'movie', mediaId });
    },
    [markStaleMutation]
  );

  // ── N/A exclusion ──
  const excludeMutation = trpc.media.comparisons.excludeFromDimension.useMutation();

  const handleNA = useCallback(
    (mediaId: number) => {
      if (!currentDimension || excludeMutation.isPending) return;
      const title =
        mediaId === debrief?.movie.mediaId
          ? (debrief?.movie.title ?? 'Movie')
          : (currentDimension.opponent?.title ?? 'Movie');
      excludeMutation.mutate(
        { mediaType: 'movie', mediaId, dimensionId: currentDimension.dimensionId },
        {
          onSuccess: () => {
            toast.success(`${title} excluded from this dimension`);
            void utils.media.comparisons.getDebrief.invalidate({
              mediaType: 'movie',
              mediaId: movieId,
            });
          },
        }
      );
    },
    [currentDimension, debrief, excludeMutation, utils, movieId]
  );

  // ── Blacklist (not watched) ──
  const [blacklistTarget, setBlacklistTarget] = useState<{
    id: number;
    title: string;
  } | null>(null);

  const { data: blacklistComparisonData } = trpc.media.comparisons.listForMedia.useQuery(
    { mediaType: 'movie', mediaId: blacklistTarget?.id ?? 0, limit: 1 },
    { enabled: blacklistTarget !== null }
  );
  const comparisonsToPurge = blacklistComparisonData?.pagination?.total ?? null;

  const blacklistMutation = trpc.media.comparisons.blacklistMovie.useMutation({
    onSuccess: (_data, variables) => {
      const title =
        variables.mediaId === debrief?.movie.mediaId
          ? (debrief?.movie.title ?? 'Movie')
          : (currentDimension?.opponent?.title ?? 'Movie');
      toast.success(`${title} marked as not watched`);
      setBlacklistTarget(null);
      void utils.media.comparisons.getDebrief.invalidate({ mediaType: 'movie', mediaId: movieId });
    },
  });

  const handleBlacklist = useCallback((movie: { id: number; title: string }) => {
    setBlacklistTarget(movie);
  }, []);

  const confirmBlacklist = useCallback(() => {
    if (!blacklistTarget) return;
    blacklistMutation.mutate({ mediaType: 'movie', mediaId: blacklistTarget.id });
  }, [blacklistTarget, blacklistMutation]);

  // ── Pick / draw ──
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
    navigate('/media/compare');
  };

  const isPending = recordMutation.isPending;
  const watchlistPending =
    addToWatchlistMutation.isPending || removeFromWatchlistMutation.isPending;

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
      <PageHeader
        title={debrief.movie.title}
        backHref="/media/history"
        breadcrumbs={[
          { label: 'Media', href: '/media' },
          { label: 'History', href: '/media/history' },
          { label: debrief.movie.title },
        ]}
        renderLink={Link}
      />

      {/* ── Poster header ── */}
      <div className="flex items-center gap-4" data-testid="debrief-header">
        <PosterImage
          src={debrief.movie.posterUrl}
          alt={`${debrief.movie.title} poster`}
          className="h-36 w-24 shrink-0 rounded-md object-cover"
        />
        <div>
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
                <ComparisonMovieCard
                  movie={{
                    id: debrief.movie.mediaId,
                    title: debrief.movie.title,
                    posterUrl: debrief.movie.posterUrl,
                  }}
                  onPick={() => {
                    handlePick(debrief.movie.mediaId);
                  }}
                  disabled={isPending}
                  onToggleWatchlist={() => {
                    handleToggleWatchlist(debrief.movie.mediaId);
                  }}
                  isOnWatchlist={watchlistedMovies.has(debrief.movie.mediaId)}
                  watchlistPending={watchlistPending}
                  onMarkStale={() => {
                    handleMarkStale(debrief.movie.mediaId);
                  }}
                  stalePending={markStaleMutation.isPending}
                  onNA={() => {
                    handleNA(debrief.movie.mediaId);
                  }}
                  naPending={excludeMutation.isPending}
                  onBlacklist={() => {
                    handleBlacklist({
                      id: debrief.movie.mediaId,
                      title: debrief.movie.title,
                    });
                  }}
                  blacklistPending={blacklistMutation.isPending}
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
                          disabled={isPending}
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
                <ComparisonMovieCard
                  movie={{
                    id: currentDimension.opponent.id,
                    title: currentDimension.opponent.title,
                    posterUrl: currentDimension.opponent.posterUrl ?? null,
                  }}
                  onPick={() => {
                    handlePick(currentDimension.opponent!.id);
                  }}
                  disabled={isPending}
                  onToggleWatchlist={() => {
                    handleToggleWatchlist(currentDimension.opponent!.id);
                  }}
                  isOnWatchlist={watchlistedMovies.has(currentDimension.opponent.id)}
                  watchlistPending={watchlistPending}
                  onMarkStale={() => {
                    handleMarkStale(currentDimension.opponent!.id);
                  }}
                  stalePending={markStaleMutation.isPending}
                  onNA={() => {
                    handleNA(currentDimension.opponent!.id);
                  }}
                  naPending={excludeMutation.isPending}
                  onBlacklist={() => {
                    handleBlacklist({
                      id: currentDimension.opponent!.id,
                      title: currentDimension.opponent!.title,
                    });
                  }}
                  blacklistPending={blacklistMutation.isPending}
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

      {/* ── Blacklist confirmation dialog ── */}
      <AlertDialog
        open={blacklistTarget !== null}
        onOpenChange={(open) => {
          if (!open) setBlacklistTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as not watched?</AlertDialogTitle>
            <AlertDialogDescription>
              {comparisonsToPurge !== null ? (
                <>
                  <span className="font-medium text-foreground">{comparisonsToPurge}</span>{' '}
                  comparison{comparisonsToPurge !== 1 ? 's' : ''} involving{' '}
                  <span className="font-medium text-foreground">{blacklistTarget?.title}</span> will
                  be deleted and scores recalculated.
                </>
              ) : (
                <>
                  All comparisons involving{' '}
                  <span className="font-medium text-foreground">{blacklistTarget?.title}</span> will
                  be deleted and scores recalculated.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmBlacklist}
              disabled={blacklistMutation.isPending}
            >
              {blacklistMutation.isPending ? 'Removing\u2026' : 'Not watched'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
