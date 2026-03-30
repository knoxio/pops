import { useState, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { Badge, Skeleton, Button } from "@pops/ui";
import { ImageOff } from "lucide-react";
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
  const dimensionId = activeDimensions.length > 0
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
    { enabled: dimensionId !== null, refetchOnWindowFocus: false }
  );

  const utils = trpc.useUtils();

  // Record comparison mutation
  const recordMutation = trpc.media.comparisons.record.useMutation({
    onSuccess: async (
      _data: unknown,
      variables: { mediaAId: number; mediaBId: number; winnerId: number }
    ) => {
      // Fetch updated scores for both movies to compute delta
      const winnerId = variables.winnerId;
      const loserId = variables.mediaAId === winnerId ? variables.mediaBId : variables.mediaAId;

      try {
        const [winnerScores, loserScores] = await Promise.all([
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

        const winnerScore =
          winnerScores?.data?.find((s: { dimensionId: number }) => s.dimensionId === dimensionId)
            ?.score ?? 1500;
        const loserScore =
          loserScores?.data?.find((s: { dimensionId: number }) => s.dimensionId === dimensionId)
            ?.score ?? 1500;

        // Approximate delta from current scores (K=32 Elo)
        const expectedWinner = 1 / (1 + Math.pow(10, (loserScore - winnerScore) / 400));
        const winnerDelta = Math.round(32 * (1 - expectedWinner));
        const loserDelta = -winnerDelta;

        setScoreDelta({ winnerId, loserId, winnerDelta, loserDelta });
      } catch {
        // Score fetch failed — skip animation
      }

      setSessionCount((c) => c + 1);
      setDimensionIndex((i) => i + 1);

      // Show delta briefly, then clear it (next pair loads via dimension rotation query key change)
      setTimeout(() => {
        setScoreDelta(null);
      }, 1500);
    },
  });

  // Clear delta on dimension rotation
  useEffect(() => {
    setScoreDelta(null);
  }, [dimensionIndex]);

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
                <span
                  className="font-medium text-foreground underline decoration-dotted cursor-help"
                  title={desc}
                >
                  {name}
                </span>
              ) : (
                <span className="font-medium text-foreground">{name}</span>
              );
            })()}
            ? Click to pick.
          </p>
          <div className="grid grid-cols-2 gap-6">
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
            />
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
            />
          </div>
        </>
      ) : null}

      {/* Skip + Done buttons */}
      {pairData?.data && !recordMutation.isPending && !scoreDelta && (
        <div className="flex justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setDimensionIndex((i) => i + 1)}>
            Skip this pair
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/media")}>
            Done
          </Button>
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
}: {
  movie: { id: number; title: string; posterPath: string | null; posterUrl: string | null };
  onPick: () => void;
  disabled?: boolean;
  scoreDelta?: number | null;
  isWinner?: boolean;
}) {
  const posterSrc = movie.posterUrl ?? undefined;
  const [imgError, setImgError] = useState(false);

  return (
    <button
      onClick={onPick}
      disabled={disabled}
      className={`group relative flex flex-col items-center text-center rounded-lg border p-4 transition-all ${
        isWinner
          ? "border-green-500 shadow-lg scale-[1.02]"
          : isWinner === false && scoreDelta != null
            ? "border-red-500/50 opacity-75"
            : "border-border hover:border-primary hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
      } ${disabled ? "cursor-default" : "cursor-pointer"}`}
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
