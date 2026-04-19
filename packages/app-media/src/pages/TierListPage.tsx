import { LayoutGrid, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
/**
 * TierListPage — dimension selector + TierListBoard for drag-and-drop tier placement.
 *
 * Loads up to 8 movies from getTierListMovies and renders them via TierListBoard.
 * Dimension can be switched via chips. After placing movies in tiers, submit to
 * record pairwise comparisons.
 */
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  cn,
  Skeleton,
} from '@pops/ui';

import { type Tier, TierListBoard, type TierMovie } from '../components/TierListBoard';
import { TierListSummary } from '../components/TierListSummary';
import { useTierListSubmit } from '../hooks/useTierListSubmit';

function MovieCardSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 w-28">
      <Skeleton className="w-28 aspect-[2/3] rounded-lg" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

function PoolSkeleton() {
  return (
    <div className="flex flex-wrap justify-center gap-4 py-8">
      {Array.from({ length: 8 }).map((_, i) => (
        <MovieCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function TierListPage() {
  const navigate = useNavigate();
  const [selectedDimension, setSelectedDimension] = useState<number | null>(null);

  const { data: dimensionsData, isLoading: dimsLoading } =
    trpc.media.comparisons.listDimensions.useQuery();

  const activeDimensions = useMemo(
    () => (dimensionsData?.data ?? []).filter((d: { active: boolean }) => d.active),
    [dimensionsData?.data]
  );

  const effectiveDimension = selectedDimension ?? activeDimensions[0]?.id ?? null;

  const {
    data: tierMoviesData,
    isLoading: moviesLoading,
    error: moviesError,
    refetch,
    isFetching,
  } = trpc.media.comparisons.getTierListMovies.useQuery(
    { dimensionId: effectiveDimension ?? 0 },
    { enabled: effectiveDimension != null, staleTime: Infinity }
  );

  const movies: TierMovie[] = useMemo(
    () =>
      (tierMoviesData?.data ?? []).map((m) => ({
        mediaType: 'movie' as const,
        mediaId: m.id,
        title: m.title,
        posterUrl: m.posterUrl,
        score: m.score,
        comparisonCount: m.comparisonCount,
      })),
    [tierMoviesData]
  );

  const movieTitles = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of movies) {
      map.set(m.mediaId, m.title);
    }
    return map;
  }, [movies]);

  const {
    submit,
    result,
    reset,
    isPending,
    error: submitError,
  } = useTierListSubmit({
    movieTitles,
    onSuccess: () => {
      toast.success('Tier list submitted!');
    },
  });

  // --- Dismiss mutations (same as Arena) ---
  const utils = trpc.useUtils();

  // Mark stale
  const markStaleMutation = trpc.media.comparisons.markStale.useMutation({
    onSuccess: (
      data: { data: { staleness: number } },
      variables: { mediaType: string; mediaId: number }
    ) => {
      const movie = movies.find((m) => m.mediaId === variables.mediaId);
      const staleness = data.data.staleness;
      const timesMarked = Math.round(Math.log(staleness) / Math.log(0.5));
      toast.success(`${movie?.title ?? 'Movie'} marked stale (×${timesMarked})`);
      refetch();
    },
  });

  const handleMarkStale = useCallback(
    (movieId: number) => {
      if (markStaleMutation.isPending) return;
      markStaleMutation.mutate({ mediaType: 'movie', mediaId: movieId });
    },
    [markStaleMutation]
  );

  // N/A (dimension exclusion)
  const excludeMutation = trpc.media.comparisons.excludeFromDimension.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleNA = useCallback(
    (movieId: number) => {
      if (!effectiveDimension || excludeMutation.isPending) return;
      const movie = movies.find((m) => m.mediaId === movieId);
      excludeMutation.mutate(
        { mediaType: 'movie', mediaId: movieId, dimensionId: effectiveDimension },
        {
          onSuccess: () => {
            toast.success(`${movie?.title ?? 'Movie'} excluded from this dimension`);
          },
        }
      );
    },
    [effectiveDimension, excludeMutation, movies]
  );

  // Blacklist (Not Watched) — with confirmation dialog
  const [blacklistTarget, setBlacklistTarget] = useState<{
    id: number;
    title: string;
  } | null>(null);

  const blacklistMutation = trpc.media.comparisons.blacklistMovie.useMutation({
    onSuccess: (_data: unknown, variables: { mediaType: string; mediaId: number }) => {
      const movie = movies.find((m) => m.mediaId === variables.mediaId);
      toast.success(`${movie?.title ?? 'Movie'} marked as not watched`);
      setBlacklistTarget(null);
      refetch();
      utils.media.comparisons.getSmartPair.invalidate();
    },
  });

  const handleNotWatched = useCallback(
    (movieId: number) => {
      const movie = movies.find((m) => m.mediaId === movieId);
      if (movie) {
        setBlacklistTarget({ id: movie.mediaId, title: movie.title });
      }
    },
    [movies]
  );

  const handleDimensionChange = useCallback(
    (dimId: number) => {
      setSelectedDimension(dimId);
      reset();
    },
    [reset]
  );

  const handleDoAnother = useCallback(() => {
    reset();
  }, [reset]);

  const handleDone = useCallback(() => {
    navigate('/media/rankings');
  }, [navigate]);

  const handleSubmit = useCallback(
    (placements: Array<{ movieId: number; tier: Tier }>) => {
      if (effectiveDimension != null) {
        submit(effectiveDimension, placements);
      }
    },
    [effectiveDimension, submit]
  );

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <LayoutGrid className="h-6 w-6 text-app-accent" />
        <h1 className="text-2xl font-bold">Tier List</h1>
      </div>

      {dimsLoading ? (
        <PoolSkeleton />
      ) : activeDimensions.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">No active dimensions. Create one to get started.</p>
        </div>
      ) : (
        <>
          <div
            className="flex flex-wrap justify-center gap-2"
            role="tablist"
            aria-label="Dimension selector"
          >
            {activeDimensions.map((dim: { id: number; name: string }) => (
              <button
                key={dim.id}
                role="tab"
                aria-selected={effectiveDimension === dim.id}
                onClick={() => {
                  handleDimensionChange(dim.id);
                }}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                  effectiveDimension === dim.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                )}
              >
                {dim.name}
              </button>
            ))}
          </div>

          {submitError && (
            <Alert variant="destructive">
              <AlertTitle>Submission Failed</AlertTitle>
              <AlertDescription>{submitError.message}</AlertDescription>
            </Alert>
          )}

          {result ? (
            <TierListSummary
              comparisonsRecorded={result.comparisonsRecorded}
              scoreChanges={result.scoreChanges}
              onDoAnother={handleDoAnother}
              onDone={handleDone}
            />
          ) : (
            effectiveDimension && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                    aria-label="Refresh movie pool"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
                    Refresh
                  </button>
                </div>

                {moviesError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>Failed to load movies for tier list.</AlertDescription>
                  </Alert>
                ) : moviesLoading ? (
                  <PoolSkeleton />
                ) : movies.length === 0 ? (
                  <div className="text-center py-16">
                    <LayoutGrid className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                    <p className="text-muted-foreground">
                      No eligible movies for this dimension. Compare more movies or check your
                      exclusions.
                    </p>
                  </div>
                ) : (
                  <TierListBoard
                    movies={movies}
                    onSubmit={handleSubmit}
                    submitPending={isPending}
                    onNotWatched={handleNotWatched}
                    onMarkStale={handleMarkStale}
                    onNA={handleNA}
                  />
                )}
              </div>
            )
          )}
        </>
      )}

      {/* Blacklist confirmation dialog */}
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
              This will remove <strong>{blacklistTarget?.title}</strong> from all comparisons and
              rankings across every dimension. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (blacklistTarget) {
                  blacklistMutation.mutate({
                    mediaType: 'movie',
                    mediaId: blacklistTarget.id,
                  });
                }
              }}
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
