/**
 * CompareArenaPage — Pick-the-winner comparison arena for movies.
 *
 * Shows two movie cards side-by-side. Click one to pick the winner.
 * Tracks session count and auto-loads the next pair.
 */
import { useState, useCallback } from "react";
import { Link } from "react-router";
import { Badge, Skeleton } from "@pops/ui";
import { trpc } from "../lib/trpc";

export function CompareArenaPage() {
  const [sessionCount, setSessionCount] = useState(0);
  const [selectedDimensionId, setSelectedDimensionId] = useState<number | null>(
    null,
  );

  // Fetch dimensions for tab selector
  const { data: dimensionsData, isLoading: dimsLoading } =
    trpc.media.comparisons.listDimensions.useQuery();

  const activeDimensions = dimensionsData?.data?.filter((d) => d.active) ?? [];

  // Auto-select first dimension when loaded
  const dimensionId = selectedDimensionId ?? activeDimensions[0]?.id ?? null;

  // Fetch random pair
  const {
    data: pairData,
    isLoading: pairLoading,
    error: pairError,
    refetch: refetchPair,
  } = trpc.media.comparisons.getRandomPair.useQuery(
    { dimensionId: dimensionId! },
    { enabled: dimensionId !== null, refetchOnWindowFocus: false },
  );

  // Record comparison mutation
  const recordMutation = trpc.media.comparisons.record.useMutation({
    onSuccess: () => {
      setSessionCount((c) => c + 1);
      refetchPair();
    },
  });

  const handlePick = useCallback(
    (winnerId: number) => {
      if (!pairData?.data || !dimensionId || recordMutation.isPending) return;

      const { movieA, movieB } = pairData.data;
      recordMutation.mutate({
        dimensionId,
        mediaAType: "movie",
        mediaAId: movieA.id,
        mediaBType: "movie",
        mediaBId: movieB.id,
        winnerType: "movie",
        winnerId,
      });
    },
    [pairData, dimensionId, recordMutation],
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Compare Arena</h1>
        <Badge variant="outline" className="text-sm">
          {sessionCount} comparison{sessionCount !== 1 ? "s" : ""} this session
        </Badge>
      </div>

      {/* Dimension tabs */}
      {dimsLoading ? (
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      ) : activeDimensions.length === 0 ? (
        <p className="text-muted-foreground">
          No comparison dimensions configured yet. Create dimensions first to
          start comparing.
        </p>
      ) : (
        <div className="flex gap-2 flex-wrap" role="tablist">
          {activeDimensions.map((dim) => (
            <button
              key={dim.id}
              role="tab"
              aria-selected={dim.id === dimensionId}
              onClick={() => {
                setSelectedDimensionId(dim.id);
                refetchPair();
              }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                dim.id === dimensionId
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {dim.name}
            </button>
          ))}
        </div>
      )}

      {/* Arena */}
      {pairLoading || recordMutation.isPending ? (
        <div className="grid grid-cols-2 gap-6">
          <MovieCardSkeleton />
          <MovieCardSkeleton />
        </div>
      ) : pairError ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg mb-2">Not enough watched movies</p>
          <p className="text-sm">
            Watch at least 2 movies to start comparing.{" "}
            <Link to="/media" className="text-primary underline">
              Browse library
            </Link>
          </p>
        </div>
      ) : pairData?.data ? (
        <>
          <p className="text-center text-muted-foreground text-sm">
            Which movie wins? Click to pick.
          </p>
          <div className="grid grid-cols-2 gap-6">
            <MovieCard
              movie={pairData.data.movieA}
              onPick={() => handlePick(pairData.data.movieA.id)}
            />
            <MovieCard
              movie={pairData.data.movieB}
              onPick={() => handlePick(pairData.data.movieB.id)}
            />
          </div>
        </>
      ) : null}

      {/* Skip button */}
      {pairData?.data && !recordMutation.isPending && (
        <div className="text-center">
          <button
            onClick={() => refetchPair()}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip this pair
          </button>
        </div>
      )}
    </div>
  );
}

function MovieCard({
  movie,
  onPick,
}: {
  movie: { id: number; title: string; posterPath: string | null };
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      className="group flex flex-col items-center text-center rounded-lg border border-border p-4 transition-all hover:border-primary hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
    >
      {movie.posterPath ? (
        <img
          src={`/api/media/images/poster?path=${encodeURIComponent(movie.posterPath)}`}
          alt={`${movie.title} poster`}
          className="w-full aspect-[2/3] rounded-md object-cover mb-3"
        />
      ) : (
        <div className="w-full aspect-[2/3] rounded-md bg-muted flex items-center justify-center mb-3">
          <span className="text-muted-foreground text-4xl">🎬</span>
        </div>
      )}
      <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
        {movie.title}
      </h3>
    </button>
  );
}

function MovieCardSkeleton() {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border p-4">
      <Skeleton className="w-full aspect-[2/3] rounded-md mb-3" />
      <Skeleton className="h-4 w-24" />
    </div>
  );
}
