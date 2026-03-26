/**
 * DiscoverPage — personalized movie discovery with trending and recommendations.
 * Three horizontal scroll sections: Recommended for You, Trending, Similar to Top Rated.
 */
import { useState, useCallback } from "react";
import { Alert, Button } from "@pops/ui";
import { Compass, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { HorizontalScrollRow } from "../components/HorizontalScrollRow";
import { DiscoverCard } from "../components/DiscoverCard";

export function DiscoverPage() {
  const utils = trpc.useUtils();

  // Queries
  const trending = trpc.media.discovery.trending.useQuery(
    { timeWindow: "week", page: 1 },
    { staleTime: 5 * 60 * 1000 }
  );

  const recommendations = trpc.media.discovery.recommendations.useQuery(
    { sampleSize: 3 },
    { staleTime: 5 * 60 * 1000 }
  );

  const similarToTopRated = trpc.media.discovery.recommendations.useQuery(
    { sampleSize: 5 },
    { staleTime: 5 * 60 * 1000 }
  );

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
            posterUrl={item.posterUrl}
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
      <HorizontalScrollRow title="Trending This Week" isLoading={trending.isLoading}>
        {trending.error && (
          <Alert variant="destructive" className="flex items-center gap-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p className="flex-1 text-sm">{trending.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => trending.refetch()}>
              <RefreshCw className="mr-1 h-3 w-3" /> Retry
            </Button>
          </Alert>
        )}
        {trending.data?.results.map((item) => (
          <DiscoverCard
            key={item.tmdbId}
            tmdbId={item.tmdbId}
            title={item.title}
            releaseDate={item.releaseDate}
            posterPath={item.posterPath}
            posterUrl={item.posterUrl}
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
        {similarToTopRated.data?.results.slice(0, 20).map((item) => (
          <DiscoverCard
            key={item.tmdbId}
            tmdbId={item.tmdbId}
            title={item.title}
            releaseDate={item.releaseDate}
            posterPath={item.posterPath}
            posterUrl={item.posterUrl}
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
