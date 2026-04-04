import { useState, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { Badge, Skeleton, Button, Tooltip, TooltipContent, TooltipTrigger } from "@pops/ui";
import { ImageOff, Bookmark, ChevronUp, Minus, ChevronDown, Clock } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { DimensionManager } from "../components/DimensionManager";

interface ScoreDelta {
  winnerId: number;
  loserId: number;
  winnerDelta: number;
  loserDelta: number;
}

export function CompareArenaPage() {
  const navigate = useNavigate();
  const [sessionCount, setSessionCount] = useState(0);
  const [dimensionIndex, setDimensionIndex] = useState(0);
  const [scoreDelta, setScoreDelta] = useState<ScoreDelta | null>(null);

  // Fetch dimensions for tab selector
  const { data: dimensionsData, isLoading: dimsLoading } =
    trpc.media.comparisons.listDimensions.useQuery();

  const activeDimensions = dimensionsData?.data?.filter((d: { active: boolean }) => d.active) ?? [];

  // Derive current dimension from rotation index
  const dimensionId =
    activeDimensions.length > 0
      ? (activeDimensions[dimensionIndex % activeDimensions.length]?.id ?? null)
      : null;

  // Fetch random pair
  const {
    data: pairData,
    isLoading: pairLoading,
    error: pairError,
    refetch: refetchPair,
  } = trpc.media.comparisons.getRandomPair.useQuery(
    { dimensionId: dimensionId! },
    {
      enabled: dimensionId !== null,
      refetchOnWindowFocus: false,
      // Never cache — each call should return a fresh random pair
      gcTime: 0,
      staleTime: 0,
    }
  );

  const utils = trpc.useUtils();

  // Record comparison mutation
  const recordMutation = trpc.media.comparisons.record.useMutation({
    onSuccess: async (
      _data: unknown,
      variables: {
        mediaAId: number;
        mediaBId: number;
        winnerId: number;
        drawTier?: "high" | "mid" | "low" | null;
      }
    ) => {
      const isDraw = variables.winnerId === 0;
      const winnerId = isDraw ? variables.mediaAId : variables.winnerId;
      const loserId = variables.mediaAId === winnerId ? variables.mediaBId : variables.mediaAId;

      try {
        const [scoresA, scoresB] = await Promise.all([
          utils.media.comparisons.scores.fetch({
            mediaType: "movie",
            mediaId: winnerId,
            dimensionId: dimensionId ?? undefined,
          }),
          utils.media.comparisons.scores.fetch({
            mediaType: "movie",
            mediaId: loserId,
            dimensionId: dimensionId ?? undefined,
          }),
        ]);

        const scoreA =
          scoresA?.data?.find((s: { dimensionId: number }) => s.dimensionId === dimensionId)
            ?.score ?? 1500;
        const scoreB =
          scoresB?.data?.find((s: { dimensionId: number }) => s.dimensionId === dimensionId)
            ?.score ?? 1500;

        if (isDraw) {
          // Both get the same delta for draws
          const drawOutcome =
            variables.drawTier === "high" ? 0.7 : variables.drawTier === "low" ? 0.3 : 0.5;
          const expectedA = 1 / (1 + Math.pow(10, (scoreB - scoreA) / 400));
          const delta = Math.round(32 * (drawOutcome - expectedA));
          setScoreDelta({ winnerId, loserId, winnerDelta: delta, loserDelta: delta });
        } else {
          const expectedWinner = 1 / (1 + Math.pow(10, (scoreB - scoreA) / 400));
          const winnerDelta = Math.round(32 * (1 - expectedWinner));
          setScoreDelta({ winnerId, loserId, winnerDelta, loserDelta: -winnerDelta });
        }
      } catch {
        // Score fetch failed — skip animation
      }

      setSessionCount((c) => c + 1);
      setDimensionIndex((i) => i + 1);

      // Invalidate pair cache so next fetch returns a fresh random pair
      // (without this, returning to the same dimensionId serves the cached pair)
      utils.media.comparisons.getRandomPair.invalidate();

      // Show delta briefly, then clear it
      setTimeout(() => {
        setScoreDelta(null);
      }, 1500);
    },
  });

  // Clear delta on dimension rotation
  useEffect(() => {
    setScoreDelta(null);
  }, [dimensionIndex]);

  // Watchlist: check which movies are on it, add mutation
  const movieAId = pairData?.data?.movieA?.id;
  const _movieBId = pairData?.data?.movieB?.id;

  const { data: watchlistData } = trpc.media.watchlist.list.useQuery(
    { mediaType: "movie" },
    { enabled: !!pairData?.data }
  );

  const watchlistedMovieIds = new Set(
    (watchlistData?.data ?? [])
      .filter((e: { mediaType: string }) => e.mediaType === "movie")
      .map((e: { mediaId: number }) => e.mediaId)
  );

  const addToWatchlistMutation = trpc.media.watchlist.add.useMutation({
    onSuccess: (_data: unknown, variables: { mediaType: string; mediaId: number }) => {
      utils.media.watchlist.list.invalidate();
      const movie =
        variables.mediaId === movieAId ? pairData?.data?.movieA : pairData?.data?.movieB;
      toast.success(`${movie?.title ?? "Movie"} added to watchlist`);
    },
  });

  // Mark stale mutation
  const markStaleMutation = trpc.media.comparisons.markStale.useMutation({
    onSuccess: (
      data: { data: { staleness: number } },
      variables: { mediaType: string; mediaId: number }
    ) => {
      const movie =
        variables.mediaId === movieAId ? pairData?.data?.movieA : pairData?.data?.movieB;
      const staleness = data.data.staleness;
      const timesMarked = Math.round(Math.log(staleness) / Math.log(0.5));
      toast.success(`${movie?.title ?? "Movie"} marked stale (×${timesMarked})`);
      // Advance to next pair
      utils.media.comparisons.getRandomPair.invalidate();
      setDimensionIndex((i) => i + 1);
    },
  });

  const handleMarkStale = useCallback(
    (movieId: number) => {
      if (markStaleMutation.isPending) return;
      markStaleMutation.mutate({ mediaType: "movie", mediaId: movieId });
    },
    [markStaleMutation]
  );

  // N/A (dimension exclusion) mutation
  const excludeAMutation = trpc.media.comparisons.excludeFromDimension.useMutation();
  const excludeBMutation = trpc.media.comparisons.excludeFromDimension.useMutation();
  const naIsPending = excludeAMutation.isPending || excludeBMutation.isPending;

  const handleNA = useCallback(() => {
    if (!pairData?.data || !dimensionId || naIsPending) return;

    const { movieA, movieB } = pairData.data;
    excludeAMutation.mutate({ mediaType: "movie", mediaId: movieA.id, dimensionId });
    excludeBMutation.mutate(
      { mediaType: "movie", mediaId: movieB.id, dimensionId },
      {
        onSuccess: () => {
          toast.success("Both movies excluded from this dimension");
          utils.media.comparisons.getRandomPair.invalidate();
        },
      }
    );
  }, [pairData, dimensionId, naIsPending, excludeAMutation, excludeBMutation, utils]);

  const handleAddToWatchlist = useCallback(
    (movieId: number) => {
      addToWatchlistMutation.mutate({
        mediaType: "movie",
        mediaId: movieId,
      });
    },
    [addToWatchlistMutation]
  );

  const handlePick = useCallback(
    (winnerId: number) => {
      if (!pairData?.data || !dimensionId || recordMutation.isPending) return;

      const { movieA, movieB } = pairData.data;
      recordMutation.mutate({
        dimensionId,
        mediaAType: "movie" as const,
        mediaAId: movieA.id,
        mediaBType: "movie" as const,
        mediaBId: movieB.id,
        winnerType: "movie" as const,
        winnerId,
      });
    },
    [pairData, dimensionId, recordMutation]
  );

  const handleDraw = useCallback(
    (tier: "high" | "mid" | "low") => {
      if (!pairData?.data || !dimensionId || recordMutation.isPending) return;

      const { movieA, movieB } = pairData.data;
      recordMutation.mutate({
        dimensionId,
        mediaAType: "movie" as const,
        mediaAId: movieA.id,
        mediaBType: "movie" as const,
        mediaBId: movieB.id,
        winnerType: "movie" as const,
        winnerId: 0,
        drawTier: tier,
      });
    },
    [pairData, dimensionId, recordMutation]
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Compare Arena</h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            {sessionCount} comparison{sessionCount !== 1 ? "s" : ""} this session
          </Badge>
          <Link to="/media/compare/history">
            <Button variant="outline" size="sm">
              History
            </Button>
          </Link>
          <DimensionManager />
        </div>
      </div>

      {/* Dimension tabs */}
      {dimsLoading ? (
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      ) : activeDimensions.length === 0 ? (
        <p className="text-muted-foreground">No comparison dimensions configured yet.</p>
      ) : (
        <div className="flex gap-2 flex-wrap" role="tablist">
          {activeDimensions.map((dim: { id: number; name: string }) => (
            <span
              key={dim.id}
              role="tab"
              aria-selected={dim.id === dimensionId}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                dim.id === dimensionId
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {dim.name}
            </span>
          ))}
        </div>
      )}

      {/* Arena */}
      {pairLoading ? (
        <div className="grid grid-cols-2 gap-6">
          <MovieCardSkeleton />
          <MovieCardSkeleton />
        </div>
      ) : pairError ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg mb-2">Something went wrong</p>
          <p className="text-sm">
            {pairError.message}{" "}
            <button onClick={() => refetchPair()} className="text-primary underline">
              Try again
            </button>
          </p>
        </div>
      ) : pairData?.data === null ? (
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
            Which movie has better{" "}
            {(() => {
              const dim = activeDimensions.find((d: { id: number }) => d.id === dimensionId);
              const name = dim?.name ?? "Overall";
              const desc = dim?.description;
              return desc ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-medium text-foreground underline decoration-dotted cursor-help">
                      {name}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{desc}</TooltipContent>
                </Tooltip>
              ) : (
                <span className="font-medium text-foreground">{name}</span>
              );
            })()}
            ? Click to pick.
          </p>
          <div className="relative grid grid-cols-2 gap-6">
            <MovieCard
              movie={pairData.data.movieA}
              onPick={() => handlePick(pairData.data.movieA.id)}
              disabled={recordMutation.isPending || scoreDelta !== null}
              scoreDelta={
                scoreDelta?.winnerId === pairData.data.movieA.id
                  ? (scoreDelta?.winnerDelta ?? null)
                  : scoreDelta?.loserId === pairData.data.movieA.id
                    ? (scoreDelta?.loserDelta ?? null)
                    : null
              }
              isWinner={scoreDelta?.winnerId === pairData.data.movieA.id}
              onAddToWatchlist={() => handleAddToWatchlist(pairData.data.movieA.id)}
              isOnWatchlist={watchlistedMovieIds.has(pairData.data.movieA.id)}
              watchlistPending={addToWatchlistMutation.isPending}
            />

            {/* Draw tier buttons — centered between cards */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col gap-1.5">
              {[
                {
                  tier: "high" as const,
                  icon: ChevronUp,
                  label: "Equally great",
                  color: "hover:border-green-500 hover:text-green-500",
                },
                {
                  tier: "mid" as const,
                  icon: Minus,
                  label: "Equally average",
                  color: "hover:border-muted-foreground",
                },
                {
                  tier: "low" as const,
                  icon: ChevronDown,
                  label: "Equally poor",
                  color: "hover:border-red-500 hover:text-red-500",
                },
              ].map(({ tier, icon: Icon, label, color }) => (
                <Tooltip key={tier}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDraw(tier)}
                      disabled={recordMutation.isPending || scoreDelta !== null}
                      className={`rounded-full h-10 w-10 shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 bg-background ${color}`}
                      aria-label={label}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              ))}
            </div>

            <MovieCard
              movie={pairData.data.movieB}
              onPick={() => handlePick(pairData.data.movieB.id)}
              disabled={recordMutation.isPending || scoreDelta !== null}
              scoreDelta={
                scoreDelta?.winnerId === pairData.data.movieB.id
                  ? (scoreDelta?.winnerDelta ?? null)
                  : scoreDelta?.loserId === pairData.data.movieB.id
                    ? (scoreDelta?.loserDelta ?? null)
                    : null
              }
              isWinner={scoreDelta?.winnerId === pairData.data.movieB.id}
              onAddToWatchlist={() => handleAddToWatchlist(pairData.data.movieB.id)}
              isOnWatchlist={watchlistedMovieIds.has(pairData.data.movieB.id)}
              watchlistPending={addToWatchlistMutation.isPending}
            />
          </div>
        </>
      ) : null}

      {/* Action bar: Stale buttons + Skip + N/A + Done */}
      {pairData?.data && !recordMutation.isPending && !scoreDelta && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex justify-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleMarkStale(pairData.data.movieA.id)}
                  disabled={markStaleMutation.isPending}
                  aria-label={`Mark ${pairData.data.movieA.title} as stale`}
                >
                  <Clock className="h-3.5 w-3.5 mr-1.5" />
                  Stale: {pairData.data.movieA.title}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Mark as stale — reduces score weight for future comparisons
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleMarkStale(pairData.data.movieB.id)}
                  disabled={markStaleMutation.isPending}
                  aria-label={`Mark ${pairData.data.movieB.title} as stale`}
                >
                  <Clock className="h-3.5 w-3.5 mr-1.5" />
                  Stale: {pairData.data.movieB.title}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Mark as stale — reduces score weight for future comparisons
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                utils.media.comparisons.getRandomPair.invalidate();
                setDimensionIndex((i) => i + 1);
              }}
            >
              Skip this pair
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNA}
              disabled={naIsPending}
              className="text-muted-foreground"
            >
              {naIsPending ? "Excluding…" : "N/A"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/media")}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MovieCard({
  movie,
  onPick,
  disabled,
  scoreDelta,
  isWinner,
  onAddToWatchlist,
  isOnWatchlist,
  watchlistPending,
}: {
  movie: { id: number; title: string; posterPath: string | null; posterUrl: string | null };
  onPick: () => void;
  disabled?: boolean;
  scoreDelta?: number | null;
  isWinner?: boolean;
  onAddToWatchlist?: () => void;
  isOnWatchlist?: boolean;
  watchlistPending?: boolean;
}) {
  const posterSrc = movie.posterUrl ?? undefined;
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={`group relative flex flex-col items-center text-center rounded-lg border p-4 transition-all ${
        isWinner
          ? "border-green-500 shadow-lg scale-[1.02]"
          : isWinner === false && scoreDelta != null
            ? "border-red-500/50 opacity-75"
            : "border-border hover:border-primary hover:shadow-lg hover:scale-[1.02]"
      }`}
    >
      {/* Main clickable area for picking winner */}
      <button
        onClick={onPick}
        disabled={disabled}
        className={`w-full flex flex-col items-center ${disabled ? "cursor-default" : "cursor-pointer active:scale-[0.98]"}`}
      >
        {imgError ? (
          <div className="w-full aspect-[2/3] rounded-md mb-3 bg-muted flex items-center justify-center">
            <ImageOff className="h-8 w-8 text-muted-foreground" />
          </div>
        ) : (
          <img
            src={posterSrc}
            alt={`${movie.title} poster`}
            className="w-full aspect-[2/3] rounded-md object-cover mb-3"
            onError={() => setImgError(true)}
          />
        )}
        <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
          {movie.title}
        </h3>
      </button>

      {/* Add to watchlist button */}
      {onAddToWatchlist && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddToWatchlist();
          }}
          disabled={isOnWatchlist || watchlistPending}
          className={`absolute top-2 left-2 p-1.5 rounded-full transition-colors ${
            isOnWatchlist
              ? "bg-app-accent text-app-accent-foreground"
              : "bg-background/80 text-muted-foreground hover:text-foreground hover:bg-background"
          }`}
          aria-label={isOnWatchlist ? "On watchlist" : `Add ${movie.title} to watchlist`}
        >
          <Bookmark className={`h-4 w-4 ${isOnWatchlist ? "fill-current" : ""}`} />
        </button>
      )}

      {/* Score delta animation */}
      {scoreDelta != null && (
        <div
          className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-bold animate-bounce ${
            scoreDelta > 0 ? "bg-green-500/90 text-white" : "bg-red-500/90 text-white"
          }`}
        >
          {scoreDelta > 0 ? "+" : ""}
          {scoreDelta}
        </div>
      )}
    </div>
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
