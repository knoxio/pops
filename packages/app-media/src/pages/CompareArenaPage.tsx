import { useState, useCallback } from "react";
import { Link } from "react-router";
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
  Skeleton,
  Button,
  Select,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@pops/ui";
import {
  ImageOff,
  Bookmark,
  ChevronUp,
  Minus,
  ChevronDown,
  Clock,
  EyeOff,
  SkipForward,
  Ban,
  History,
} from "lucide-react";
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
  const [sessionCount, setSessionCount] = useState(0);
  const [manualDimensionId, setManualDimensionId] = useState<number | null>(null);
  const [scoreDelta, setScoreDelta] = useState<ScoreDelta | null>(null);

  // Fetch dimensions for selector
  const { data: dimensionsData, isLoading: dimsLoading } =
    trpc.media.comparisons.listDimensions.useQuery();

  const activeDimensions = dimensionsData?.data?.filter((d: { active: boolean }) => d.active) ?? [];

  // Fetch smart pair — pass manualDimensionId if set, otherwise let backend auto-select
  const {
    data: pairData,
    isLoading: pairLoading,
    error: pairError,
    refetch: refetchPair,
  } = trpc.media.comparisons.getSmartPair.useQuery(
    manualDimensionId ? { dimensionId: manualDimensionId } : {},
    {
      enabled: activeDimensions.length > 0,
      refetchOnWindowFocus: false,
      gcTime: 0,
      staleTime: 0,
    }
  );

  // The active dimension comes from the smart pair response
  const dimensionId = pairData?.data?.dimensionId ?? null;

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
      setManualDimensionId(null);
      utils.media.comparisons.getSmartPair.invalidate();

      setTimeout(() => {
        setScoreDelta(null);
      }, 1500);
    },
  });

  // Watchlist
  const movieAId = pairData?.data?.movieA?.id;

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

  // Mark stale
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
      setManualDimensionId(null);
      utils.media.comparisons.getSmartPair.invalidate();
    },
  });

  const handleMarkStale = useCallback(
    (movieId: number) => {
      if (markStaleMutation.isPending) return;
      markStaleMutation.mutate({ mediaType: "movie", mediaId: movieId });
    },
    [markStaleMutation]
  );

  // N/A (dimension exclusion)
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
          toast.success("Both excluded from this dimension");
          utils.media.comparisons.getSmartPair.invalidate();
        },
      }
    );
  }, [pairData, dimensionId, naIsPending, excludeAMutation, excludeBMutation, utils]);

  // Blacklist (Not Watched)
  const [blacklistTarget, setBlacklistTarget] = useState<{
    id: number;
    title: string;
  } | null>(null);

  const { data: blacklistComparisonData } = trpc.media.comparisons.listForMedia.useQuery(
    { mediaType: "movie", mediaId: blacklistTarget?.id ?? 0, limit: 1 },
    { enabled: blacklistTarget !== null }
  );
  const comparisonsToPurge = blacklistComparisonData?.pagination?.total ?? null;

  const blacklistMutation = trpc.media.comparisons.blacklistMovie.useMutation({
    onSuccess: (_data: unknown, variables: { mediaType: string; mediaId: number }) => {
      const movie =
        variables.mediaId === movieAId ? pairData?.data?.movieA : pairData?.data?.movieB;
      toast.success(`${movie?.title ?? "Movie"} marked as not watched`);
      setBlacklistTarget(null);
      utils.media.comparisons.getSmartPair.invalidate();
    },
  });

  const handleBlacklist = useCallback((movie: { id: number; title: string }) => {
    setBlacklistTarget(movie);
  }, []);

  const confirmBlacklist = useCallback(() => {
    if (!blacklistTarget) return;
    blacklistMutation.mutate({ mediaType: "movie", mediaId: blacklistTarget.id });
  }, [blacklistTarget, blacklistMutation]);

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

  // Skip pair
  const skipMutation = trpc.media.comparisons.recordSkip.useMutation({
    onSuccess: () => {
      toast.success("Pair skipped");
      setManualDimensionId(null);
      utils.media.comparisons.getSmartPair.invalidate();
    },
  });

  const handleSkip = useCallback(() => {
    if (!pairData?.data || !dimensionId || skipMutation.isPending) return;

    const { movieA, movieB } = pairData.data;
    skipMutation.mutate({
      dimensionId,
      mediaAType: "movie" as const,
      mediaAId: movieA.id,
      mediaBType: "movie" as const,
      mediaBId: movieB.id,
    });
  }, [pairData, dimensionId, skipMutation]);

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

  const isPending = recordMutation.isPending || scoreDelta !== null;
  const activeDimName =
    activeDimensions.find((d: { id: number }) => d.id === dimensionId)?.name ?? "Overall";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Arena</h1>
          {sessionCount > 0 && (
            <Badge variant="outline" className="text-xs tabular-nums">
              {sessionCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link to="/media/compare/history">
                <Button variant="ghost" size="icon" aria-label="Comparison history">
                  <History className="h-4.5 w-4.5" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent>History</TooltipContent>
          </Tooltip>
          <DimensionManager />
        </div>
      </div>

      {/* Dimension selector */}
      {dimsLoading ? (
        <Skeleton className="h-11 w-48" />
      ) : activeDimensions.length === 0 ? (
        <p className="text-muted-foreground text-sm">No dimensions configured yet.</p>
      ) : (
        <Select
          value={String(dimensionId ?? "")}
          onChange={(e) => {
            const id = Number(e.target.value);
            setManualDimensionId(id);
            setScoreDelta(null);
            utils.media.comparisons.getSmartPair.invalidate();
          }}
          options={activeDimensions.map((dim: { id: number; name: string }) => ({
            value: String(dim.id),
            label: dim.name,
          }))}
          variant="ghost"
          size="sm"
          containerClassName="w-auto"
          aria-label="Comparison dimension"
        />
      )}

      {/* Arena */}
      {pairLoading ? (
        <div className="grid grid-cols-2 gap-8">
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
          {watchlistedMovieIds.size > 0 ? (
            <>
              <p className="text-lg mb-2">Not enough movies</p>
              <p className="text-sm">
                Some are on your watchlist.{" "}
                <Link to="/media/watchlist" className="text-primary underline">
                  View watchlist
                </Link>
              </p>
            </>
          ) : (
            <>
              <p className="text-lg mb-2">Not enough watched movies</p>
              <p className="text-sm">
                Watch at least 2 movies to start comparing.{" "}
                <Link to="/media" className="text-primary underline">
                  Browse library
                </Link>
              </p>
            </>
          )}
        </div>
      ) : pairData?.data ? (
        <div className="relative grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
          {/* Movie A */}
          <MovieCard
            movie={pairData.data.movieA}
            onPick={() => handlePick(pairData.data.movieA.id)}
            disabled={isPending}
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
            onMarkStale={() => handleMarkStale(pairData.data.movieA.id)}
            stalePending={markStaleMutation.isPending}
            onBlacklist={() => handleBlacklist(pairData.data.movieA)}
            blacklistPending={blacklistMutation.isPending}
            dimensionName={activeDimName}
          />

          {/* Center column — actions for both movies */}
          <div className="flex flex-col items-center gap-1.5">
            {/* Draw tier buttons */}
            {(
              [
                {
                  tier: "high" as const,
                  icon: ChevronUp,
                  label: "Equally great",
                  hoverColor: "hover:border-green-500 hover:text-green-500",
                },
                {
                  tier: "mid" as const,
                  icon: Minus,
                  label: "Equally average",
                  hoverColor: "hover:border-muted-foreground",
                },
                {
                  tier: "low" as const,
                  icon: ChevronDown,
                  label: "Equally poor",
                  hoverColor: "hover:border-red-500 hover:text-red-500",
                },
              ] as const
            ).map(({ tier, icon: Icon, label, hoverColor }) => (
              <Tooltip key={tier}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleDraw(tier)}
                    disabled={isPending}
                    className={`rounded-full h-10 w-10 bg-background ${hoverColor}`}
                    aria-label={label}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ))}

            {/* Separator */}
            <div className="w-5 border-t border-border my-1" />

            {/* Skip pair */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleSkip}
                  disabled={isPending || skipMutation.isPending}
                  className="rounded-full h-10 w-10 bg-background hover:border-muted-foreground"
                  aria-label="Skip this pair"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Skip pair</TooltipContent>
            </Tooltip>

            {/* N/A — exclude both from dimension */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleNA}
                  disabled={isPending || naIsPending}
                  className="rounded-full h-10 w-10 bg-background hover:border-muted-foreground"
                  aria-label={`Exclude both from ${activeDimName}`}
                >
                  <Ban className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">N/A for {activeDimName}</TooltipContent>
            </Tooltip>
          </div>

          {/* Movie B */}
          <MovieCard
            movie={pairData.data.movieB}
            onPick={() => handlePick(pairData.data.movieB.id)}
            disabled={isPending}
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
            onMarkStale={() => handleMarkStale(pairData.data.movieB.id)}
            stalePending={markStaleMutation.isPending}
            onBlacklist={() => handleBlacklist(pairData.data.movieB)}
            blacklistPending={blacklistMutation.isPending}
            dimensionName={activeDimName}
          />
        </div>
      ) : null}

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
              {comparisonsToPurge !== null ? (
                <>
                  <span className="font-medium text-foreground">{comparisonsToPurge}</span>{" "}
                  comparison{comparisonsToPurge !== 1 ? "s" : ""} involving{" "}
                  <span className="font-medium text-foreground">{blacklistTarget?.title}</span> will
                  be deleted and scores recalculated.
                </>
              ) : (
                <>
                  All comparisons involving{" "}
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
              {blacklistMutation.isPending ? "Removing\u2026" : "Not Watched"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Single movie card with zone-based action layout. */
function MovieCard({
  movie,
  onPick,
  disabled,
  scoreDelta,
  isWinner,
  onAddToWatchlist,
  isOnWatchlist,
  watchlistPending,
  onMarkStale,
  stalePending,
  onBlacklist,
  blacklistPending,
  dimensionName,
}: {
  movie: { id: number; title: string; posterPath: string | null; posterUrl: string | null };
  onPick: () => void;
  disabled?: boolean;
  scoreDelta?: number | null;
  isWinner?: boolean;
  onAddToWatchlist?: () => void;
  isOnWatchlist?: boolean;
  watchlistPending?: boolean;
  onMarkStale?: () => void;
  stalePending?: boolean;
  onBlacklist?: () => void;
  blacklistPending?: boolean;
  dimensionName?: string;
}) {
  const posterSrc = movie.posterUrl ?? undefined;
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`group relative rounded-lg overflow-hidden transition-all ${
          isWinner
            ? "ring-2 ring-green-500 shadow-lg scale-[1.02]"
            : isWinner === false && scoreDelta != null
              ? "ring-2 ring-red-500/50 opacity-75"
              : ""
        }`}
      >
        {/* Main clickable poster area */}
        <button
          onClick={onPick}
          disabled={disabled}
          className={`w-full block ${disabled ? "cursor-default" : "cursor-pointer active:scale-[0.98]"} transition-transform`}
        >
          {imgError ? (
            <div className="w-full aspect-[2/3] bg-muted flex items-center justify-center">
              <ImageOff className="h-8 w-8 text-muted-foreground" />
            </div>
          ) : (
            <img
              src={posterSrc}
              alt={`${movie.title} poster`}
              className="w-full aspect-[2/3] object-cover"
              onError={() => setImgError(true)}
            />
          )}
        </button>

        {/* TOP ZONE — non-dismissing actions */}
        {onAddToWatchlist && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToWatchlist();
                }}
                disabled={isOnWatchlist || watchlistPending}
                className={`absolute top-2 left-2 p-1.5 rounded-full backdrop-blur-sm transition-colors ${
                  isOnWatchlist
                    ? "bg-app-accent/90 text-app-accent-foreground"
                    : "bg-black/50 text-white/80 hover:text-white hover:bg-black/70"
                }`}
                aria-label={isOnWatchlist ? "On watchlist" : `Add ${movie.title} to watchlist`}
              >
                <Bookmark className={`h-4 w-4 ${isOnWatchlist ? "fill-current" : ""}`} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{isOnWatchlist ? "On watchlist" : "Add to watchlist"}</TooltipContent>
          </Tooltip>
        )}

        {/* Score delta animation */}
        {scoreDelta != null && (
          <div
            className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-bold tabular-nums animate-bounce ${
              scoreDelta > 0 ? "bg-green-500/90 text-white" : "bg-red-500/90 text-white"
            }`}
          >
            {scoreDelta > 0 ? "+" : ""}
            {scoreDelta}
          </div>
        )}

        {/* BOTTOM ZONE — dismissing actions (visible on hover/touch) */}
        <div className="absolute bottom-0 inset-x-0 flex justify-center gap-2 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          {onMarkStale && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkStale();
                  }}
                  disabled={stalePending}
                  className="p-2 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 backdrop-blur-sm transition-colors"
                  aria-label={`Mark ${movie.title} as stale`}
                >
                  <Clock className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Stale — reduce score weight</TooltipContent>
            </Tooltip>
          )}
          {onBlacklist && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onBlacklist();
                  }}
                  disabled={blacklistPending}
                  className="p-2 rounded-full bg-black/40 text-white/80 hover:text-red-400 hover:bg-black/60 backdrop-blur-sm transition-colors"
                  aria-label={`Not watched ${movie.title}`}
                >
                  <EyeOff className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Not watched — remove from {dimensionName ?? "rankings"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Title — clickable, same as picking winner */}
      <button
        onClick={onPick}
        disabled={disabled}
        className={`font-semibold text-sm text-center truncate px-1 transition-colors hover:text-primary ${disabled ? "cursor-default" : "cursor-pointer"}`}
      >
        {movie.title}
      </button>
    </div>
  );
}

function MovieCardSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="w-full aspect-[2/3] rounded-lg" />
      <Skeleton className="h-4 w-24 mx-auto" />
    </div>
  );
}
