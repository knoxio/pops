/**
 * DiscoverPage — personalized movie discovery with trending and recommendations.
 * Three horizontal scroll sections: Recommended for You, Trending, Similar to Top Rated.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
      isWatched?: boolean;
      onWatchlist?: boolean;
    }>
  >([]);

  // Queries
  const trending = trpc.media.discovery.trending.useQuery(
    { timeWindow, page: trendingPage },
    { staleTime: 5 * 60 * 1000 }
  );

  // Accumulate trending results when new data arrives, deduplicating by tmdbId
  useEffect(() => {
    if (trending.data?.results) {
      if (trendingPage === 1) {
        setAccumulatedResults(trending.data.results);
      } else {
        setAccumulatedResults((prev) => {
          const existingIds = new Set(prev.map((r) => r.tmdbId));
          const newItems = trending.data!.results.filter((r) => !existingIds.has(r.tmdbId));
          return [...prev, ...newItems];
        });
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

  const rewatchSuggestions = trpc.media.discovery.rewatchSuggestions.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const genreSpotlight = trpc.media.discovery.genreSpotlight.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  // Reset per-genre accumulated state when base query data changes (e.g. after invalidation)
  useEffect(() => {
    setGenreAccumulated({});
    setGenrePages({});
  }, [genreSpotlight.dataUpdatedAt]);

  // Per-genre pagination for Load More
  const [genrePages, setGenrePages] = useState<Record<number, number>>({});
  const [genreAccumulated, setGenreAccumulated] = useState<
    Record<
      number,
      Array<{
        tmdbId: number;
        title: string;
        releaseDate: string;
        posterPath: string | null;
        posterUrl: string | null;
        voteAverage: number;
        inLibrary: boolean;
        isWatched?: boolean;
        onWatchlist?: boolean;
        matchPercentage: number;
        matchReason: string;
      }>
    >
  >({});
  const [genreLoadingMore, setGenreLoadingMore] = useState<Set<number>>(new Set());

  const handleGenreLoadMore = useCallback(
    async (genreId: number, totalPages: number) => {
      const currentPage = genrePages[genreId] ?? 1;
      const nextPage = currentPage + 1;
      if (nextPage > totalPages) return;

      // Collect page-1 IDs for dedup
      const page1Ids = new Set(
        genreSpotlight.data?.genres
          ?.find((g: { genreId: number }) => g.genreId === genreId)
          ?.results.map((r: { tmdbId: number }) => r.tmdbId) ?? []
      );

      setGenreLoadingMore((prev) => new Set(prev).add(genreId));
      try {
        const data = await utils.media.discovery.genreSpotlightPage.fetch({
          genreId,
          page: nextPage,
        });
        setGenrePages((prev) => ({ ...prev, [genreId]: nextPage }));
        setGenreAccumulated((prev) => {
          const existing = prev[genreId] ?? [];
          const existingIds = new Set([...existing.map((r) => r.tmdbId), ...page1Ids]);
          const newItems = data.results.filter((r) => !existingIds.has(r.tmdbId));
          return { ...prev, [genreId]: [...existing, ...newItems] };
        });
      } catch {
        toast.error("Failed to load more results");
      } finally {
        setGenreLoadingMore((prev) => {
          const next = new Set(prev);
          next.delete(genreId);
          return next;
        });
      }
    },
    [genrePages, genreSpotlight.data, utils]
  );

  // Context picks — each collection accumulates results across pages
  const [contextPages, setContextPages] = useState<Record<string, number>>({});
  const [accumulatedContext, setAccumulatedContext] = useState<
    Record<
      string,
      Array<{
        tmdbId: number;
        title: string;
        releaseDate: string | null;
        posterPath: string | null;
        posterUrl: string | null;
        voteAverage: number | null;
        inLibrary: boolean;
        isWatched?: boolean;
        onWatchlist?: boolean;
      }>
    >
  >({});

  const contextPicks = trpc.media.discovery.contextPicks.useQuery(
    { pages: Object.keys(contextPages).length > 0 ? contextPages : undefined },
    { staleTime: 5 * 60 * 1000 }
  );

  // Accumulate context picks results when new data arrives
  // Uses a ref for contextPages to avoid stale closure issues with rapid clicks
  const contextPagesRef = useRef(contextPages);
  contextPagesRef.current = contextPages;

  useEffect(() => {
    if (contextPicks.data?.collections) {
      setAccumulatedContext((prev) => {
        const next = { ...prev };
        const pages = contextPagesRef.current;
        for (const col of contextPicks.data!.collections) {
          const page = pages[col.id] ?? 1;
          if (page === 1) {
            next[col.id] = col.results;
          } else {
            const existing = prev[col.id] ?? [];
            const existingIds = new Set(existing.map((r) => r.tmdbId));
            const newItems = col.results.filter((r) => !existingIds.has(r.tmdbId));
            next[col.id] = [...existing, ...newItems];
          }
        }
        return next;
      });
    }
  }, [contextPicks.data]);

  const watchlistRecs = trpc.media.discovery.watchlistRecommendations.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const similarToTopRated = trpc.media.discovery.recommendations.useQuery(
    { sampleSize: 5 },
    { staleTime: 5 * 60 * 1000 }
  );

  const fromYourServer = trpc.media.discovery.fromYourServer.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const trendingPlex = trpc.media.discovery.trendingPlex.useQuery(
    { limit: 20 },
    { staleTime: 5 * 60 * 1000 }
  );

  const totalComparisons = profile.data?.data?.totalComparisons ?? 0;
  const hasEnoughComparisons = totalComparisons >= COMPARISON_THRESHOLD;

  // Dismissed movies — server-side
  const dismissed = trpc.media.discovery.getDismissed.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const dismissedSet = useMemo(() => new Set(dismissed.data?.data ?? []), [dismissed.data]);
  const [optimisticDismissed, setOptimisticDismissed] = useState<Set<number>>(new Set());
  const isDismissed = useCallback(
    (tmdbId: number) => dismissedSet.has(tmdbId) || optimisticDismissed.has(tmdbId),
    [dismissedSet, optimisticDismissed]
  );

  // Track in-progress mutations per tmdbId
  const [addingToLibrary, setAddingToLibrary] = useState<Set<number>>(new Set());
  const [addingToWatchlist, setAddingToWatchlist] = useState<Set<number>>(new Set());
  const [markingWatched, setMarkingWatched] = useState<Set<number>>(new Set());
  const [markingRewatched, setMarkingRewatched] = useState<Set<number>>(new Set());
  const [dismissing, setDismissing] = useState<Set<number>>(new Set());

  // Mutations
  const addMovieMutation = trpc.media.library.addMovie.useMutation();
  const addWatchlistMutation = trpc.media.watchlist.add.useMutation();
  const logWatchMutation = trpc.media.watchHistory.log.useMutation();
  const dismissMutation = trpc.media.discovery.dismiss.useMutation();

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
        void utils.media.discovery.genreSpotlight.invalidate();
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
        // Then add to watchlist using the local DB id (idempotent)
        const watchlistResult = await addWatchlistMutation.mutateAsync({
          mediaType: "movie",
          mediaId: libResult.data.id,
        });
        if (watchlistResult.created) {
          toast.success(`Added "${libResult.data.title}" to watchlist`);
        } else {
          toast.info(`"${libResult.data.title}" is already on watchlist`);
        }
        void utils.media.watchlist.list.invalidate();
        void utils.media.discovery.trending.invalidate();
        void utils.media.discovery.recommendations.invalidate();
        void utils.media.discovery.genreSpotlight.invalidate();
        void utils.media.discovery.watchlistRecommendations.invalidate();
      } catch {
        toast.error("Failed to add to watchlist");
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

  const handleMarkWatched = useCallback(
    async (tmdbId: number) => {
      setMarkingWatched((prev) => new Set(prev).add(tmdbId));
      try {
        const libResult = await addMovieMutation.mutateAsync({ tmdbId });
        await logWatchMutation.mutateAsync({
          mediaType: "movie",
          mediaId: libResult.data.id,
        });
        toast.success(`Marked "${libResult.data.title}" as watched`);
        void utils.media.discovery.trending.invalidate();
        void utils.media.discovery.recommendations.invalidate();
        void utils.media.discovery.genreSpotlight.invalidate();
        void utils.media.discovery.rewatchSuggestions.invalidate();
      } catch {
        toast.error("Failed to mark as watched");
      } finally {
        setMarkingWatched((prev) => {
          const next = new Set(prev);
          next.delete(tmdbId);
          return next;
        });
      }
    },
    [addMovieMutation, logWatchMutation, utils]
  );

  const handleMarkRewatched = useCallback(
    async (tmdbId: number) => {
      setMarkingRewatched((prev) => new Set(prev).add(tmdbId));
      try {
        const libResult = await addMovieMutation.mutateAsync({ tmdbId });
        await logWatchMutation.mutateAsync({
          mediaType: "movie",
          mediaId: libResult.data.id,
        });
        toast.success(`Logged rewatch of "${libResult.data.title}"`);
        void utils.media.discovery.rewatchSuggestions.invalidate();
      } catch {
        toast.error("Failed to log rewatch");
      } finally {
        setMarkingRewatched((prev) => {
          const next = new Set(prev);
          next.delete(tmdbId);
          return next;
        });
      }
    },
    [addMovieMutation, logWatchMutation, utils]
  );

  const handleNotInterested = useCallback(
    async (tmdbId: number) => {
      // Optimistic: hide immediately
      setOptimisticDismissed((prev) => new Set(prev).add(tmdbId));
      setDismissing((prev) => new Set(prev).add(tmdbId));
      try {
        await dismissMutation.mutateAsync({ tmdbId });
        void utils.media.discovery.getDismissed.invalidate();
      } catch {
        // Revert optimistic dismiss on failure
        setOptimisticDismissed((prev) => {
          const next = new Set(prev);
          next.delete(tmdbId);
          return next;
        });
        toast.error("Failed to dismiss");
      } finally {
        setDismissing((prev) => {
          const next = new Set(prev);
          next.delete(tmdbId);
          return next;
        });
      }
    },
    [dismissMutation, utils]
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
            .filter((item) => !isDismissed(item.tmdbId))
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
                isWatched?: boolean;
                onWatchlist?: boolean;
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
                  onMarkWatched={handleMarkWatched}
                  isMarkingWatched={markingWatched.has(item.tmdbId)}
                  isWatched={item.isWatched}
                  onWatchlist={item.onWatchlist}
                  onMarkRewatched={handleMarkRewatched}
                  isMarkingRewatched={markingRewatched.has(item.tmdbId)}
                  onNotInterested={handleNotInterested}
                  isDismissing={dismissing.has(item.tmdbId)}
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
          {accumulatedResults
            .filter((item) => !isDismissed(item.tmdbId))
            .map((item) => (
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
                onMarkWatched={handleMarkWatched}
                isMarkingWatched={markingWatched.has(item.tmdbId)}
                isWatched={item.isWatched}
                onWatchlist={item.onWatchlist}
                onMarkRewatched={handleMarkRewatched}
                isMarkingRewatched={markingRewatched.has(item.tmdbId)}
                onNotInterested={handleNotInterested}
                isDismissing={dismissing.has(item.tmdbId)}
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

      {/* Genre Spotlight — hidden when no genres */}
      {genreSpotlight.isLoading && !genreSpotlight.data && (
        <HorizontalScrollRow title="Best in ..." isLoading={true}>
          {null}
        </HorizontalScrollRow>
      )}
      {genreSpotlight.error && !genreSpotlight.data && (
        <Alert variant="destructive" className="flex items-center gap-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="flex-1 text-sm">{genreSpotlight.error.message}</p>
          <Button variant="outline" size="sm" onClick={() => genreSpotlight.refetch()}>
            <RefreshCw className="mr-1 h-3 w-3" /> Retry
          </Button>
        </Alert>
      )}
      {genreSpotlight.data?.genres?.map(
        (genre: {
          genreId: number;
          genreName: string;
          totalPages: number;
          results: Array<{
            tmdbId: number;
            title: string;
            releaseDate: string;
            posterPath: string | null;
            posterUrl: string | null;
            voteAverage: number;
            inLibrary: boolean;
            isWatched?: boolean;
            onWatchlist?: boolean;
            matchPercentage: number;
            matchReason: string;
          }>;
        }) => {
          const extraResults = genreAccumulated[genre.genreId] ?? [];
          const page1Ids = new Set(genre.results.map((r) => r.tmdbId));
          const allResults = [
            ...genre.results,
            ...extraResults.filter((r) => !page1Ids.has(r.tmdbId)),
          ].filter((item) => !isDismissed(item.tmdbId));
          const currentPage = genrePages[genre.genreId] ?? 1;
          const hasMore = currentPage < genre.totalPages;

          return (
            <div key={genre.genreId} className="space-y-3">
              <HorizontalScrollRow
                title={`Best in ${genre.genreName}`}
                isLoading={genreSpotlight.isLoading}
              >
                {allResults.map((item) => (
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
                    onMarkWatched={handleMarkWatched}
                    isMarkingWatched={markingWatched.has(item.tmdbId)}
                    isWatched={item.isWatched}
                    onWatchlist={item.onWatchlist}
                    onMarkRewatched={handleMarkRewatched}
                    isMarkingRewatched={markingRewatched.has(item.tmdbId)}
                    onNotInterested={handleNotInterested}
                    isDismissing={dismissing.has(item.tmdbId)}
                    matchPercentage={item.matchPercentage}
                    matchReason={item.matchReason}
                  />
                ))}
              </HorizontalScrollRow>
              {hasMore && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleGenreLoadMore(genre.genreId, genre.totalPages)}
                    disabled={genreLoadingMore.has(genre.genreId)}
                  >
                    {genreLoadingMore.has(genre.genreId) ? (
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
          );
        }
      )}

      {/* Worth Rewatching — hidden when empty */}
      {(rewatchSuggestions.isLoading || (rewatchSuggestions.data?.data?.length ?? 0) > 0) && (
        <HorizontalScrollRow
          title="Worth Rewatching"
          subtitle="Movies you loved — worth another watch"
          isLoading={rewatchSuggestions.isLoading}
        >
          {rewatchSuggestions.error && (
            <Alert variant="destructive" className="flex items-center gap-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p className="flex-1 text-sm">{rewatchSuggestions.error.message}</p>
              <Button variant="outline" size="sm" onClick={() => rewatchSuggestions.refetch()}>
                <RefreshCw className="mr-1 h-3 w-3" /> Retry
              </Button>
            </Alert>
          )}
          {rewatchSuggestions.data?.data
            ?.filter((item: { tmdbId: number }) => !isDismissed(item.tmdbId))
            .map(
              (item: {
                tmdbId: number;
                title: string;
                releaseDate: string | null;
                posterPath: string | null;
                posterUrl: string | null;
                voteAverage: number | null;
                inLibrary: boolean;
                isWatched?: boolean;
                onWatchlist?: boolean;
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
                  onMarkWatched={handleMarkWatched}
                  isMarkingWatched={markingWatched.has(item.tmdbId)}
                  isWatched={item.isWatched}
                  onWatchlist={item.onWatchlist}
                  onMarkRewatched={handleMarkRewatched}
                  isMarkingRewatched={markingRewatched.has(item.tmdbId)}
                  onNotInterested={handleNotInterested}
                  isDismissing={dismissing.has(item.tmdbId)}
                />
              )
            )}
        </HorizontalScrollRow>
      )}

      {/* Trending on Plex — hidden when not connected or API fails */}
      {trendingPlex.data?.data && trendingPlex.data.data.length > 0 && (
        <HorizontalScrollRow title="Trending on Plex" isLoading={false}>
          {trendingPlex.data.data.map(
            (item: {
              tmdbId: number;
              title: string;
              releaseDate: string | null;
              posterPath: string | null;
              posterUrl: string | null;
              voteAverage: number | null;
              inLibrary: boolean;
              isWatched?: boolean;
              onWatchlist?: boolean;
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
                onMarkWatched={handleMarkWatched}
                isMarkingWatched={markingWatched.has(item.tmdbId)}
                isWatched={item.isWatched}
                onWatchlist={item.onWatchlist}
                onMarkRewatched={handleMarkRewatched}
                isMarkingRewatched={markingRewatched.has(item.tmdbId)}
              />
            )
          )}
        </HorizontalScrollRow>
      )}

      {/* From Your Watchlist — hidden when empty */}
      {(watchlistRecs.isLoading || (watchlistRecs.data?.results?.length ?? 0) > 0) && (
        <HorizontalScrollRow
          title="From Your Watchlist"
          subtitle={
            watchlistRecs.data?.sourceMovies?.length
              ? `Similar to ${watchlistRecs.data.sourceMovies.slice(0, 3).join(", ")}`
              : "Similar to movies on your watchlist"
          }
          isLoading={watchlistRecs.isLoading}
        >
          {watchlistRecs.error && (
            <Alert variant="destructive" className="flex items-center gap-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p className="flex-1 text-sm">{watchlistRecs.error.message}</p>
              <Button variant="outline" size="sm" onClick={() => watchlistRecs.refetch()}>
                <RefreshCw className="mr-1 h-3 w-3" /> Retry
              </Button>
            </Alert>
          )}
          {!watchlistRecs.error && watchlistRecs.data?.results?.length === 0 && (
            <p className="py-8 text-sm text-muted-foreground">
              Add more movies to your watchlist to get suggestions.
            </p>
          )}
          {watchlistRecs.data?.results
            ?.filter((item: { tmdbId: number }) => !isDismissed(item.tmdbId))
            .map(
              (item: {
                tmdbId: number;
                title: string;
                releaseDate: string | null;
                posterPath: string | null;
                posterUrl: string | null;
                voteAverage: number | null;
                inLibrary: boolean;
                isWatched?: boolean;
                onWatchlist?: boolean;
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
                  onMarkWatched={handleMarkWatched}
                  isMarkingWatched={markingWatched.has(item.tmdbId)}
                  isWatched={item.isWatched}
                  onWatchlist={item.onWatchlist}
                  onMarkRewatched={handleMarkRewatched}
                  isMarkingRewatched={markingRewatched.has(item.tmdbId)}
                  onNotInterested={handleNotInterested}
                  isDismissing={dismissing.has(item.tmdbId)}
                  matchPercentage={item.matchPercentage}
                  matchReason={item.matchReason}
                />
              )
            )}
        </HorizontalScrollRow>
      )}

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
          .filter((item) => !isDismissed(item.tmdbId))
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
              isWatched?: boolean;
              onWatchlist?: boolean;
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
                onMarkWatched={handleMarkWatched}
                isMarkingWatched={markingWatched.has(item.tmdbId)}
                isWatched={item.isWatched}
                onWatchlist={item.onWatchlist}
                onMarkRewatched={handleMarkRewatched}
                isMarkingRewatched={markingRewatched.has(item.tmdbId)}
                onNotInterested={handleNotInterested}
                isDismissing={dismissing.has(item.tmdbId)}
                matchPercentage={item.matchPercentage}
                matchReason={item.matchReason}
              />
            )
          )}
      </HorizontalScrollRow>

      {/* Ready to Watch on Your Server — hidden when no results */}
      {(fromYourServer.isLoading || (fromYourServer.data?.results.length ?? 0) > 0) && (
        <HorizontalScrollRow
          title="Ready to Watch on Your Server"
          subtitle="Unwatched movies on your server, ranked for you"
          isLoading={fromYourServer.isLoading}
        >
          {fromYourServer.data?.results
            .filter((item) => !isDismissed(item.tmdbId))
            .map(
              (item: {
                tmdbId: number;
                title: string;
                releaseDate: string | null;
                posterPath: string | null;
                posterUrl: string | null;
                voteAverage: number | null;
                inLibrary: boolean;
                isWatched?: boolean;
                onWatchlist?: boolean;
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
                  onMarkWatched={handleMarkWatched}
                  isMarkingWatched={markingWatched.has(item.tmdbId)}
                  isWatched={item.isWatched}
                  onWatchlist={item.onWatchlist}
                  onMarkRewatched={handleMarkRewatched}
                  isMarkingRewatched={markingRewatched.has(item.tmdbId)}
                  onNotInterested={handleNotInterested}
                  isDismissing={dismissing.has(item.tmdbId)}
                  matchPercentage={item.matchPercentage}
                  matchReason={item.matchReason}
                />
              )
            )}
        </HorizontalScrollRow>
      )}

      {/* Context-Aware Picks — show skeleton while loading, then render collections */}
      {contextPicks.isLoading && (
        <HorizontalScrollRow title="Context Picks" isLoading={true}>
          {null}
        </HorizontalScrollRow>
      )}
      {contextPicks.data?.collections?.map((collection) => (
        <div key={collection.id} className="space-y-3">
          <HorizontalScrollRow title={`${collection.emoji} ${collection.title}`} isLoading={false}>
            {contextPicks.error && (
              <Alert variant="destructive" className="flex items-center gap-3">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p className="flex-1 text-sm">{contextPicks.error.message}</p>
                <Button variant="outline" size="sm" onClick={() => contextPicks.refetch()}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Retry
                </Button>
              </Alert>
            )}
            {(accumulatedContext[collection.id] ?? collection.results)
              .filter((item) => !isDismissed(item.tmdbId))
              .map(
                (item: {
                  tmdbId: number;
                  title: string;
                  releaseDate: string | null;
                  posterPath: string | null;
                  posterUrl: string | null;
                  voteAverage: number | null;
                  inLibrary: boolean;
                  isWatched?: boolean;
                  onWatchlist?: boolean;
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
                    onMarkWatched={handleMarkWatched}
                    isMarkingWatched={markingWatched.has(item.tmdbId)}
                    isWatched={item.isWatched}
                    onWatchlist={item.onWatchlist}
                    onMarkRewatched={handleMarkRewatched}
                    isMarkingRewatched={markingRewatched.has(item.tmdbId)}
                    onNotInterested={handleNotInterested}
                    isDismissing={dismissing.has(item.tmdbId)}
                  />
                )
              )}
          </HorizontalScrollRow>
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setContextPages((prev) => ({
                  ...prev,
                  [collection.id]: (prev[collection.id] ?? 1) + 1,
                }))
              }
              disabled={contextPicks.isFetching}
            >
              {contextPicks.isFetching ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Loading…
                </>
              ) : (
                "Load More"
              )}
            </Button>
          </div>
        </div>
      ))}

      {/* Preference Profile */}
      <PreferenceProfile data={profile.data?.data} isLoading={profile.isLoading} />
    </div>
  );
}
