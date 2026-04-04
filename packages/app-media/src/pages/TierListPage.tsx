/**
 * TierListPage — dimension selector + tier rows + unranked movie pool.
 *
 * Loads up to 8 movies from getTierListMovies. Users drag movies from the
 * unranked pool into S/A/B/C/D tier rows, then submit placements.
 */
import { useState, useMemo, useCallback } from "react";
import { Alert, AlertTitle, AlertDescription, Button, Skeleton, cn } from "@pops/ui";
import { LayoutGrid, RefreshCw, Send } from "lucide-react";
import { trpc } from "../lib/trpc";

const TIERS = ["S", "A", "B", "C", "D"] as const;
type Tier = (typeof TIERS)[number];

const TIER_COLORS: Record<Tier, string> = {
  S: "bg-red-500/20 border-red-500/40 text-red-600 dark:text-red-400",
  A: "bg-orange-500/20 border-orange-500/40 text-orange-600 dark:text-orange-400",
  B: "bg-yellow-500/20 border-yellow-500/40 text-yellow-600 dark:text-yellow-400",
  C: "bg-green-500/20 border-green-500/40 text-green-600 dark:text-green-400",
  D: "bg-blue-500/20 border-blue-500/40 text-blue-600 dark:text-blue-400",
};

const TIER_LABEL_BG: Record<Tier, string> = {
  S: "bg-red-500",
  A: "bg-orange-500",
  B: "bg-yellow-500",
  C: "bg-green-500",
  D: "bg-blue-500",
};

interface TierListMovie {
  id: number;
  title: string;
  posterUrl: string | null;
  score: number;
  comparisonCount: number;
}

type Placements = Record<Tier, TierListMovie[]>;

function emptyPlacements(): Placements {
  return { S: [], A: [], B: [], C: [], D: [] };
}

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

interface MovieCardProps {
  movie: TierListMovie;
  compact?: boolean;
}

function MovieCard({ movie, compact }: MovieCardProps) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/json", JSON.stringify(movie));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing select-none group",
        compact ? "w-20" : "w-28"
      )}
      role="listitem"
      aria-label={movie.title}
    >
      <div
        className={cn(
          "relative rounded-lg overflow-hidden border-2 border-transparent group-hover:border-primary/50 transition-colors bg-muted",
          compact ? "w-20 aspect-[2/3]" : "w-28 aspect-[2/3]"
        )}
      >
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
            <LayoutGrid className={compact ? "h-5 w-5" : "h-8 w-8"} />
          </div>
        )}
      </div>
      <span
        className={cn(
          "text-center leading-tight line-clamp-2 max-w-full",
          compact ? "text-[10px]" : "text-xs"
        )}
      >
        {movie.title}
      </span>
    </div>
  );
}

interface TierRowProps {
  tier: Tier;
  movies: TierListMovie[];
  onDrop: (tier: Tier, movie: TierListMovie) => void;
}

function TierRow({ tier, movies, onDrop }: TierRowProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      try {
        const movie = JSON.parse(e.dataTransfer.getData("application/json")) as TierListMovie;
        onDrop(tier, movie);
      } catch {
        // ignore invalid drag data
      }
    },
    [tier, onDrop]
  );

  return (
    <div
      className={cn(
        "flex items-stretch rounded-lg border-2 min-h-[5rem] transition-colors",
        TIER_COLORS[tier],
        dragOver && "ring-2 ring-primary ring-offset-2"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="list"
      aria-label={`Tier ${tier}`}
    >
      <div
        className={cn(
          "flex items-center justify-center w-12 shrink-0 rounded-l-md text-white font-bold text-lg",
          TIER_LABEL_BG[tier]
        )}
      >
        {tier}
      </div>
      <div className="flex flex-wrap items-center gap-2 p-2 flex-1">
        {movies.length === 0 ? (
          <span className="text-xs text-muted-foreground/50 italic px-2">Drop movies here</span>
        ) : (
          movies.map((movie) => <MovieCard key={movie.id} movie={movie} compact />)
        )}
      </div>
    </div>
  );
}

interface TierListContentProps {
  dimensionId: number;
}

function TierListContent({ dimensionId }: TierListContentProps) {
  const { data, isLoading, error, refetch, isFetching } =
    trpc.media.comparisons.getTierListMovies.useQuery({ dimensionId }, { staleTime: Infinity });

  const [placements, setPlacements] = useState<Placements>(emptyPlacements);
  const [unranked, setUnranked] = useState<TierListMovie[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Initialize unranked from fetched data
  const fetchedMovies: TierListMovie[] = data?.data ?? [];
  if (fetchedMovies.length > 0 && !initialized) {
    setUnranked(fetchedMovies);
    setPlacements(emptyPlacements());
    setInitialized(true);
  }

  // Reset when dimensionId changes
  const [prevDimensionId, setPrevDimensionId] = useState(dimensionId);
  if (dimensionId !== prevDimensionId) {
    setPrevDimensionId(dimensionId);
    setInitialized(false);
    setPlacements(emptyPlacements());
    setUnranked([]);
  }

  const handleRefresh = useCallback(() => {
    setInitialized(false);
    setPlacements(emptyPlacements());
    setUnranked([]);
    refetch();
  }, [refetch]);

  const placedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const tier of TIERS) {
      for (const m of placements[tier]) {
        ids.add(m.id);
      }
    }
    return ids;
  }, [placements]);

  const placedCount = placedIds.size;

  const handleDropOnTier = useCallback((tier: Tier, movie: TierListMovie) => {
    setPlacements((prev) => {
      const next = { ...prev };
      // Remove from any existing tier
      for (const t of TIERS) {
        next[t] = prev[t].filter((m) => m.id !== movie.id);
      }
      // Add to target tier
      next[tier] = [...next[tier], movie];
      return next;
    });
    // Remove from unranked if present
    setUnranked((prev) => prev.filter((m) => m.id !== movie.id));
  }, []);

  const handleDropOnUnranked = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    try {
      const movie = JSON.parse(e.dataTransfer.getData("application/json")) as TierListMovie;
      // Remove from all tiers
      setPlacements((prev) => {
        const next = { ...prev };
        for (const t of TIERS) {
          next[t] = prev[t].filter((m) => m.id !== movie.id);
        }
        return next;
      });
      // Add back to unranked if not already there
      setUnranked((prev) => (prev.some((m) => m.id === movie.id) ? prev : [...prev, movie]));
    } catch {
      // ignore
    }
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

  if (fetchedMovies.length === 0) {
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
      {/* Tier rows */}
      <div className="space-y-2">
        {TIERS.map((tier) => (
          <TierRow key={tier} tier={tier} movies={placements[tier]} onDrop={handleDropOnTier} />
        ))}
      </div>

      {/* Unranked pool */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Unranked ({unranked.length})
          </h2>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
            aria-label="Refresh movie pool"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh
          </button>
        </div>

        <div
          className="flex flex-wrap justify-center gap-4 p-4 rounded-xl border border-dashed border-border bg-muted/30 min-h-[6rem]"
          role="list"
          aria-label="Unranked movies"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={handleDropOnUnranked}
        >
          {unranked.length === 0 ? (
            <span className="text-sm text-muted-foreground/50 italic self-center">
              All movies placed — drag here to remove from tiers
            </span>
          ) : (
            unranked.map((movie) => <MovieCard key={movie.id} movie={movie} />)
          )}
        </div>
      </div>

      {/* Submit button */}
      <div className="flex justify-end pt-2">
        <Button disabled={placedCount < 2} className="gap-2" aria-label="Submit tier list">
          <Send className="h-4 w-4" />
          Submit ({placedCount} placed)
        </Button>
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

          {effectiveDimension && <TierListContent dimensionId={effectiveDimension} />}
        </>
      )}
    </div>
  );
}
