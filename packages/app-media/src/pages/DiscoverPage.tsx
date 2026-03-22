/**
 * DiscoverPage — personalized movie discovery with trending and recommendations.
 * Three horizontal scroll sections: Recommended for You, Trending, Similar to Top Rated.
 */
import { useState, useCallback } from "react";
import { Alert } from "@pops/ui";
import { Compass, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { HorizontalScrollRow } from "../components/HorizontalScrollRow";
import { DiscoverCard } from "../components/DiscoverCard";

export function DiscoverPage() {
  const utils = trpc.useUtils();

  // Queries
  const trending = trpc.media.discovery.trending.useQuery(
    { timeWindow: "week", page: 1 },
    { staleTime: 5 * 60 * 1000 },
  );

  const recommendations = trpc.media.discovery.recommendations.useQuery(
    { sampleSize: 3 },
    { staleTime: 5 * 60 * 1000 },
  );

  const similarToTopRated = trpc.media.discovery.recommendations.useQuery(
    { sampleSize: 5 },
    { staleTime: 5 * 60 * 1000 },
  );

  // Track in-progress mutations per tmdbId
  const [addingToLibrary, setAddingToLibrary] = useState<Set<number>>(
    new Set(),
  );
  const [addingToWatchlist, setAddingToWatchlist] = useState<Set<number>>(
    new Set(),
  );

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
    [addMovieMutation, utils],
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
    [addMovieMutation, addWatchlistMutation, utils],
  );

  const hasError =
    trending.error || recommendations.error || similarToTopRated.error;

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Compass className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Discover</h1>
          <p className="text-sm text-muted-foreground">
            Find your next favourite movie
          </p>
        </div>
      </div>

      {/* Error alert */}
      {hasError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <p>
            Some sections failed to load. Check that TMDB_API_KEY is configured.
          </p>
        </Alert>
      )}

      {/* Recommended for You */}
      <HorizontalScrollRow
        title="Recommended for You"
        subtitle={
          recommendations.data?.sourceMovies.length
            ? `Based on ${recommendations.data.sourceMovies.join(", ")}`
            : undefined
        }
        isLoading={recommendations.isLoading}
      >
        {recommendations.data?.results.length === 0 && (
          <p className="py-8 text-sm text-muted-foreground">
            Add movies to your library to get personalized recommendations.
          </p>
        )}
        {recommendations.data?.results.slice(0, 20).map((item) => (
          <DiscoverCard
            key={item.tmdbId}
            tmdbId={item.tmdbId}
            title={item.title}
            releaseDate={item.releaseDate}
            posterPath={item.posterPath}
            voteAverage={item.voteAverage}
            inLibrary={item.inLibrary}
            isAddingToLibrary={addingToLibrary.has(item.tmdbId)}
            isAddingToWatchlist={addingToWatchlist.has(item.tmdbId)}
            onAddToLibrary={handleAddToLibrary}
            onAddToWatchlist={handleAddToWatchlist}
            matchPercentage={item.matchPercentage}
            matchReason={item.matchReason}
          />
        ))}
      </HorizontalScrollRow>

      {/* Trending */}
      <HorizontalScrollRow
        title="Trending This Week"
        isLoading={trending.isLoading}
      >
        {trending.data?.results.map((item) => (
          <DiscoverCard
            key={item.tmdbId}
            tmdbId={item.tmdbId}
            title={item.title}
            releaseDate={item.releaseDate}
            posterPath={item.posterPath}
            voteAverage={item.voteAverage}
            inLibrary={item.inLibrary}
            isAddingToLibrary={addingToLibrary.has(item.tmdbId)}
            isAddingToWatchlist={addingToWatchlist.has(item.tmdbId)}
            onAddToLibrary={handleAddToLibrary}
            onAddToWatchlist={handleAddToWatchlist}
          />
        ))}
      </HorizontalScrollRow>

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
        {similarToTopRated.data?.results.length === 0 && (
          <p className="py-8 text-sm text-muted-foreground">
            Rate more movies to discover similar titles.
          </p>
        )}
        {similarToTopRated.data?.results.slice(0, 20).map((item) => (
          <DiscoverCard
            key={item.tmdbId}
            tmdbId={item.tmdbId}
            title={item.title}
            releaseDate={item.releaseDate}
            posterPath={item.posterPath}
            voteAverage={item.voteAverage}
            inLibrary={item.inLibrary}
            isAddingToLibrary={addingToLibrary.has(item.tmdbId)}
            isAddingToWatchlist={addingToWatchlist.has(item.tmdbId)}
            onAddToLibrary={handleAddToLibrary}
            onAddToWatchlist={handleAddToWatchlist}
            matchPercentage={item.matchPercentage}
            matchReason={item.matchReason}
          />
        ))}
      </HorizontalScrollRow>
    </div>
  );
}
