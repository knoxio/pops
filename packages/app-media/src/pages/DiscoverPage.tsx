/**
 * DiscoverPage — personalized movie discovery with trending and recommendations.
 * Three horizontal scroll sections: Recommended for You, Trending, Similar to Top Rated.
 */
import { useState, useCallback, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { Alert, Button } from "@pops/ui";
import { Compass, AlertCircle, RefreshCw, Loader2, Swords } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { HorizontalScrollRow } from "../components/HorizontalScrollRow";
import { DiscoverCard } from "../components/DiscoverCard";
import { PreferenceProfile } from "../components/PreferenceProfile";

const COMPARISON_THRESHOLD = 5;

export function DiscoverPage() {
  const utils = trpc.useUtils();
  const [searchParams, setSearchParams] = useSearchParams();

  // Trending time window from URL (default "week")
  const timeWindow = (searchParams.get("window") === "day" ? "day" : "week") as "day" | "week";

  // Trending pagination — accumulate results across pages
  const [trendingPage, setTrendingPage] = useState(1);
  const [accumulatedResults, setAccumulatedResults] = useState<
    Array<{
      tmdbId: number;
      title: string;
      releaseDate: string | null;
      posterPath: string | null;
      posterUrl: string | null;
      voteAverage: number | null;
      inLibrary: boolean;
    }>
  >([]);

  // Queries
  const trending = trpc.media.discovery.trending.useQuery(
    { timeWindow, page: trendingPage },
    { staleTime: 5 * 60 * 1000 }
  );

  // Accumulate trending results when new data arrives
  useEffect(() => {
    if (trending.data?.results) {
      if (trendingPage === 1) {
        setAccumulatedResults(trending.data.results);
      } else {
        setAccumulatedResults((prev) => [...prev, ...trending.data!.results]);
      }
    }
  }, [trending.data, trendingPage]);

  // Reset pagination when time window changes
  const setTimeWindow = useCallback(
    (window: "day" | "week") => {
      setTrendingPage(1);
      setAccumulatedResults([]);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (window === "week") {
            next.delete("window");
          } else {
            next.set("window", window);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const hasMoreTrending = trending.data
    ? accumulatedResults.length < trending.data.totalResults
    : false;

  const recommendations = trpc.media.discovery.recommendations.useQuery(
    { sampleSize: 3 },
    { staleTime: 5 * 60 * 1000 }
  );

  const profile = trpc.media.discovery.profile.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const similarToTopRated = trpc.media.discovery.recommendations.useQuery(
    { sampleSize: 5 },
    { staleTime: 5 * 60 * 1000 }
  );

  const totalComparisons = profile.data?.data?.totalComparisons ?? 0;
  const hasEnoughComparisons = totalComparisons >= COMPARISON_THRESHOLD;

  // Track in-progress mutations per tmdbId
  const [addingToLibrary, setAddingToLibrary] = useState<Set<number>>(new Set());
  const [addingToWatchlist, setAddingToWatchlist] = useState<Set<number>>(new Set());

  // Mutations
  const addMovieMutation = trpc.media.library.addMovie.useMutation();
  const addWatchlistMutation = trpc.media.watchlist.add.useMutation();

  const handleAddToLibrary = useCallback(
    async (tmdbId: number) => {
      setAddingToLibrary((prev) => new Set(prev).add(tmdbId));
      try {
        const result = await addMovieMutation.mutateAsync({ tmdbId });
        if (result.created) {
          toast.success(`Added "${result.data.title}" to library`);
        } else {
          toast.info(`"${result.data.title}" is already in library`);
        }
        void utils.media.discovery.trending.invalidate();
        void utils.media.discovery.recommendations.invalidate();
      } catch {
        toast.error("Failed to add to library");
      } finally {
        setAddingToLibrary((prev) => {
          const next = new Set(prev);
          next.delete(tmdbId);
          return next;
        });
      }
    },
    [addMovieMutation, utils]
  );

  const handleAddToWatchlist = useCallback(
    async (tmdbId: number) => {
      setAddingToWatchlist((prev) => new Set(prev).add(tmdbId));
      try {
        // First add to library (idempotent)
        const libResult = await addMovieMutation.mutateAsync({ tmdbId });
        // Then add to watchlist using the local DB id
        await addWatchlistMutation.mutateAsync({
          mediaType: "movie",
          mediaId: libResult.data.id,
        });
        toast.success(`Added "${libResult.data.title}" to watchlist`);
        void utils.media.watchlist.list.invalidate();
        void utils.media.discovery.trending.invalidate();
        void utils.media.discovery.recommendations.invalidate();
      } catch (err) {
        // CONFLICT means already on watchlist — that's fine
        if (
          err &&
          typeof err === "object" &&
          "data" in err &&
          (err as { data?: { code?: string } }).data?.code === "CONFLICT"
        ) {
          toast.info("Already on watchlist");
        } else {
          toast.error("Failed to add to watchlist");
        }
      } finally {
        setAddingToWatchlist((prev) => {
          const next = new Set(prev);
          next.delete(tmdbId);
          return next;
        });
      }
    },
    [addMovieMutation, addWatchlistMutation, utils]
  );

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Compass className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Discover</h1>
          <p className="text-sm text-muted-foreground">Find your next favourite movie</p>
        </div>
      </div>

      {/* Recommended for You — hidden below comparison threshold */}
      {!hasEnoughComparisons && !profile.isLoading ? (
        <section className="rounded-lg border border-dashed border-border p-8 text-center">
          <Swords className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Compare more movies to unlock recommendations</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You need at least {COMPARISON_THRESHOLD} comparisons — you have {totalComparisons} so
            far.
          </p>
          <Link
            to="/media/compare"
            className="mt-4 inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Start Comparing
          </Link>
        </section>
      ) : (
        <HorizontalScrollRow
          title="Recommended for You"
          subtitle={
            recommendations.data?.sourceMovies.length
              ? `Based on ${recommendations.data.sourceMovies.join(", ")}`
              : undefined
          }
          isLoading={recommendations.isLoading || profile.isLoading}
        >
          {recommendations.error && (
            <Alert variant="destructive" className="flex items-center gap-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p className="flex-1 text-sm">{recommendations.error.message}</p>
              <Button variant="outline" size="sm" onClick={() => recommendations.refetch()}>
                <RefreshCw className="mr-1 h-3 w-3" /> Retry
              </Button>
            </Alert>
          )}
          {!recommendations.error && recommendations.data?.results.length === 0 && (
            <p className="py-8 text-sm text-muted-foreground">
              No new recommendations — keep comparing to discover more.
            </p>
          )}
          {recommendations.data?.results
            .slice(0, 20)
            .map(
              (item: {
                tmdbId: number;
                title: string;
                releaseDate: string | null;
                posterPath: string | null;
                posterUrl: string | null;
                voteAverage: number | null;
                inLibrary: boolean;
                matchPercentage?: number;
                matchReason?: string;
              }) => (
                <DiscoverCard
                  key={item.tmdbId}
                  tmdbId={item.tmdbId}
                  title={item.title}
                  releaseDate={item.releaseDate ?? ""}
                  posterPath={item.posterPath}
                  posterUrl={item.posterUrl}
                  voteAverage={item.voteAverage ?? 0}
                  inLibrary={item.inLibrary}
                  isAddingToLibrary={addingToLibrary.has(item.tmdbId)}
                  isAddingToWatchlist={addingToWatchlist.has(item.tmdbId)}
                  onAddToLibrary={handleAddToLibrary}
                  onAddToWatchlist={handleAddToWatchlist}
                  matchPercentage={item.matchPercentage}
                  matchReason={item.matchReason}
                />
              )
            )}
        </HorizontalScrollRow>
      )}

      {/* Trending */}
      <div className="space-y-3">
        {/* Time window toggle */}
        <div className="flex items-center gap-2 px-1">
          <button
            onClick={() => setTimeWindow("day")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              timeWindow === "day"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setTimeWindow("week")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              timeWindow === "week"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            This Week
          </button>
        </div>

        <HorizontalScrollRow
          title={timeWindow === "day" ? "Trending Today" : "Trending This Week"}
          isLoading={trending.isLoading && trendingPage === 1}
        >
          {trending.error && (
            <Alert variant="destructive" className="flex items-center gap-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p className="flex-1 text-sm">{trending.error.message}</p>
              <Button variant="outline" size="sm" onClick={() => trending.refetch()}>
                <RefreshCw className="mr-1 h-3 w-3" /> Retry
              </Button>
            </Alert>
          )}
          {accumulatedResults.map((item) => (
            <DiscoverCard
              key={item.tmdbId}
              tmdbId={item.tmdbId}
              title={item.title}
              releaseDate={item.releaseDate ?? ""}
              posterPath={item.posterPath}
              posterUrl={item.posterUrl}
              voteAverage={item.voteAverage ?? 0}
              inLibrary={item.inLibrary}
              isAddingToLibrary={addingToLibrary.has(item.tmdbId)}
              isAddingToWatchlist={addingToWatchlist.has(item.tmdbId)}
              onAddToLibrary={handleAddToLibrary}
              onAddToWatchlist={handleAddToWatchlist}
            />
          ))}
        </HorizontalScrollRow>

        {/* Load More */}
        {hasMoreTrending && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTrendingPage((p) => p + 1)}
              disabled={trending.isFetching}
            >
              {trending.isFetching ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Loading…
                </>
              ) : (
                "Load More"
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Similar to Your Top Rated */}
      <HorizontalScrollRow
        title="Similar to Your Top Rated"
        subtitle={
          similarToTopRated.data?.sourceMovies.length
            ? `Inspired by ${similarToTopRated.data.sourceMovies.join(", ")}`
            : undefined
        }
        isLoading={similarToTopRated.isLoading}
      >
        {similarToTopRated.error && (
          <Alert variant="destructive" className="flex items-center gap-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p className="flex-1 text-sm">{similarToTopRated.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => similarToTopRated.refetch()}>
              <RefreshCw className="mr-1 h-3 w-3" /> Retry
            </Button>
          </Alert>
        )}
        {!similarToTopRated.error && similarToTopRated.data?.results.length === 0 && (
          <p className="py-8 text-sm text-muted-foreground">
            Rate more movies to discover similar titles.
          </p>
        )}
        {similarToTopRated.data?.results
          .slice(0, 20)
          .map(
            (item: {
              tmdbId: number;
              title: string;
              releaseDate: string | null;
              posterPath: string | null;
              posterUrl: string | null;
              voteAverage: number | null;
              inLibrary: boolean;
              matchPercentage?: number;
              matchReason?: string;
            }) => (
              <DiscoverCard
                key={item.tmdbId}
                tmdbId={item.tmdbId}
                title={item.title}
                releaseDate={item.releaseDate ?? ""}
                posterPath={item.posterPath}
                posterUrl={item.posterUrl}
                voteAverage={item.voteAverage ?? 0}
                inLibrary={item.inLibrary}
                isAddingToLibrary={addingToLibrary.has(item.tmdbId)}
                isAddingToWatchlist={addingToWatchlist.has(item.tmdbId)}
                onAddToLibrary={handleAddToLibrary}
                onAddToWatchlist={handleAddToWatchlist}
                matchPercentage={item.matchPercentage}
                matchReason={item.matchReason}
              />
            )
          )}
      </HorizontalScrollRow>

      {/* Preference Profile */}
      <PreferenceProfile data={profile.data?.data} isLoading={profile.isLoading} />
    </div>
  );
}
