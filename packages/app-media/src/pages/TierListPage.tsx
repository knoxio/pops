/**
 * TierListPage — dimension selector + unranked movie pool for tier placement.
 *
 * Loads up to 8 movies from getTierListMovies and displays them as
 * draggable cards in an unranked pool. Dimension can be switched via chips.
 */
import { useState, useMemo, useCallback } from "react";
import { Alert, AlertTitle, AlertDescription, Skeleton, cn } from "@pops/ui";
import { LayoutGrid, RefreshCw } from "lucide-react";
import { trpc } from "../lib/trpc";

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

interface TierListMovie {
  id: number;
  title: string;
  posterUrl: string | null;
  score: number;
  comparisonCount: number;
}

interface MovieCardProps {
  movie: TierListMovie;
  onDragStart: (e: React.DragEvent, movie: TierListMovie) => void;
}

function MovieCard({ movie, onDragStart }: MovieCardProps) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, movie)}
      className="flex flex-col items-center gap-1.5 w-28 cursor-grab active:cursor-grabbing select-none group"
      role="listitem"
      aria-label={movie.title}
    >
      <div className="relative w-28 aspect-[2/3] rounded-lg overflow-hidden border-2 border-transparent group-hover:border-primary/50 transition-colors bg-muted">
        {movie.posterUrl ? (
          <img
            src={movie.posterUrl}
            alt={`${movie.title} poster`}
            className="w-full h-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <LayoutGrid className="h-8 w-8" />
          </div>
        )}
      </div>
      <span className="text-xs text-center leading-tight line-clamp-2 max-w-full">
        {movie.title}
      </span>
    </div>
  );
}

function UnrankedPool({ dimensionId }: { dimensionId: number }) {
  const { data, isLoading, error, refetch, isFetching } =
    trpc.media.comparisons.getTierListMovies.useQuery({ dimensionId }, { staleTime: Infinity });

  const handleDragStart = useCallback((e: React.DragEvent, movie: TierListMovie) => {
    e.dataTransfer.setData("application/json", JSON.stringify(movie));
    e.dataTransfer.effectAllowed = "move";
  }, []);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load movies for tier list.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) return <PoolSkeleton />;

  const movies: TierListMovie[] = data?.data ?? [];

  if (movies.length === 0) {
    return (
      <div className="text-center py-16">
        <LayoutGrid className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground">
          No eligible movies for this dimension. Compare more movies or check your exclusions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Unranked ({movies.length})</h2>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
          aria-label="Refresh movie pool"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      <div
        className="flex flex-wrap justify-center gap-4 p-4 rounded-xl border border-dashed border-border bg-muted/30"
        role="list"
        aria-label="Unranked movies"
      >
        {movies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} onDragStart={handleDragStart} />
        ))}
      </div>
    </div>
  );
}

export function TierListPage() {
  const [selectedDimension, setSelectedDimension] = useState<number | null>(null);

  const { data: dimensionsData, isLoading: dimsLoading } =
    trpc.media.comparisons.listDimensions.useQuery();

  const activeDimensions = useMemo(
    () => (dimensionsData?.data ?? []).filter((d: { active: boolean }) => d.active),
    [dimensionsData?.data]
  );

  // Auto-select first dimension once loaded
  const effectiveDimension = selectedDimension ?? activeDimensions[0]?.id ?? null;

  const handleDimensionChange = useCallback((dimId: number) => {
    setSelectedDimension(dimId);
  }, []);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <LayoutGrid className="h-6 w-6 text-indigo-500" />
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
                onClick={() => handleDimensionChange(dim.id)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                  effectiveDimension === dim.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                )}
              >
                {dim.name}
              </button>
            ))}
          </div>

          {effectiveDimension && <UnrankedPool dimensionId={effectiveDimension} />}
        </>
      )}
    </div>
  );
}
