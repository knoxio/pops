/**
 * TierListBoard — drag-and-drop tier placement board.
 *
 * Renders 5 tier rows (S/A/B/C/D) as drop zones plus an unranked pool.
 * Movies can be dragged between tiers and back to unranked.
 * Submit button is disabled until at least 2 movies are placed.
 */
import { useState, useCallback, useMemo } from "react";
import { Button } from "@pops/ui";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useSortable, SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { ImageOff, GripVertical, EyeOff, Clock, Ban } from "lucide-react";

const TIERS = ["S", "A", "B", "C", "D"] as const;
export type Tier = (typeof TIERS)[number];

const TIER_COLORS: Record<Tier, string> = {
  S: "bg-red-500/20 border-red-500/40 text-red-500",
  A: "bg-orange-500/20 border-orange-500/40 text-orange-500",
  B: "bg-yellow-500/20 border-yellow-500/40 text-yellow-500",
  C: "bg-green-500/20 border-green-500/40 text-green-500",
  D: "bg-blue-500/20 border-blue-500/40 text-blue-500",
};

const TIER_LABEL_COLORS: Record<Tier, string> = {
  S: "bg-red-500 text-white",
  A: "bg-orange-500 text-white",
  B: "bg-yellow-500 text-black",
  C: "bg-green-500 text-white",
  D: "bg-blue-500 text-white",
};

export interface TierMovie {
  mediaType: string;
  mediaId: number;
  title: string;
  posterUrl: string | null;
  score: number;
  comparisonCount: number;
}

export type TierPlacements = Record<Tier, number[]>;

const DISMISS_ZONES = ["not-watched", "stale", "n-a"] as const;
type DismissZone = (typeof DISMISS_ZONES)[number];

const DISMISS_ZONE_CONFIG: Record<
  DismissZone,
  { label: string; icon: typeof EyeOff; color: string }
> = {
  "not-watched": {
    label: "Not Watched",
    icon: EyeOff,
    color: "border-red-500/40 text-red-400 bg-red-500/10",
  },
  stale: {
    label: "Stale",
    icon: Clock,
    color: "border-yellow-500/40 text-yellow-400 bg-yellow-500/10",
  },
  "n-a": {
    label: "N/A",
    icon: Ban,
    color: "border-muted-foreground/40 text-muted-foreground bg-muted/30",
  },
};

interface TierListBoardProps {
  movies: TierMovie[];
  onSubmit: (placements: Array<{ movieId: number; tier: Tier }>) => void;
  submitPending?: boolean;
  onNotWatched?: (movieId: number) => void;
  onMarkStale?: (movieId: number) => void;
  onNA?: (movieId: number) => void;
}

export function TierListBoard({
  movies,
  onSubmit,
  submitPending,
  onNotWatched,
  onMarkStale,
  onNA,
}: TierListBoardProps) {
  const [placements, setPlacements] = useState<TierPlacements>({
    S: [],
    A: [],
    B: [],
    C: [],
    D: [],
  });
  const [activeId, setActiveId] = useState<number | null>(null);

  const movieMap = useMemo(() => new Map(movies.map((m) => [m.mediaId, m])), [movies]);

  const placedIds = useMemo(() => new Set(Object.values(placements).flat()), [placements]);

  const unrankedMovies = useMemo(
    () => movies.filter((m) => !placedIds.has(m.mediaId)),
    [movies, placedIds]
  );

  const totalPlaced = placedIds.size;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(Number(event.active.id));
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeIdNum = Number(active.id);
    const overId = String(over.id);

    setPlacements((prev) => {
      // Find source container using fresh state to avoid stale closure issues with rapid pointer movement
      let sourceContainer: Tier | "unranked" = "unranked";
      for (const tier of TIERS) {
        if (prev[tier].includes(activeIdNum)) {
          sourceContainer = tier;
          break;
        }
      }

      // Determine target container
      let targetContainer: Tier | "unranked";
      if (TIERS.includes(overId as Tier)) {
        targetContainer = overId as Tier;
      } else if (overId === "unranked") {
        targetContainer = "unranked";
      } else {
        // overId is a movie id — find which tier it's in using fresh state
        let found: Tier | "unranked" = "unranked";
        for (const tier of TIERS) {
          if (prev[tier].includes(Number(overId))) {
            found = tier;
            break;
          }
        }
        targetContainer = found;
      }

      if (sourceContainer === targetContainer) return prev;

      const next = { ...prev };

      // Remove from source tier
      if (sourceContainer !== "unranked") {
        next[sourceContainer] = prev[sourceContainer].filter((id) => id !== activeIdNum);
      }

      // Add to target tier
      if (targetContainer !== "unranked") {
        if (!next[targetContainer].includes(activeIdNum)) {
          next[targetContainer] = [...prev[targetContainer], activeIdNum];
        }
      }

      return next;
    });
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over) return;

      const activeIdNum = Number(active.id);
      const overId = String(over.id);

      // Check if dropped on a dismiss zone
      if (DISMISS_ZONES.includes(overId as DismissZone)) {
        const zone = overId as DismissZone;
        // Remove from all tiers first
        setPlacements((prev) => {
          const next = { ...prev };
          for (const tier of TIERS) {
            next[tier] = prev[tier].filter((id) => id !== activeIdNum);
          }
          return next;
        });
        // Trigger the appropriate callback
        if (zone === "not-watched") onNotWatched?.(activeIdNum);
        else if (zone === "stale") onMarkStale?.(activeIdNum);
        else if (zone === "n-a") onNA?.(activeIdNum);
        return;
      }

      setPlacements((prev) => {
        // Determine target container — handles tier names, "unranked", and movie ids
        let targetContainer: Tier | "unranked";
        if (TIERS.includes(overId as Tier)) {
          targetContainer = overId as Tier;
        } else if (overId === "unranked") {
          targetContainer = "unranked";
        } else {
          // overId is a movie id — find which tier it's in using fresh state
          const targetTier = TIERS.find((t) => prev[t].includes(Number(overId)));
          if (!targetTier) return prev; // over movie is unranked — no change
          targetContainer = targetTier;
        }

        const next = { ...prev };

        // Remove from all tiers
        for (const tier of TIERS) {
          next[tier] = prev[tier].filter((id) => id !== activeIdNum);
        }

        // Add to target tier if applicable
        if (targetContainer !== "unranked") {
          next[targetContainer] = [...next[targetContainer], activeIdNum];
        }

        return next;
      });
    },
    [onNotWatched, onMarkStale, onNA]
  );

  const handleSubmit = useCallback(() => {
    const result: Array<{ movieId: number; tier: Tier }> = [];
    for (const tier of TIERS) {
      for (const movieId of placements[tier]) {
        result.push({ movieId, tier });
      }
    }
    onSubmit(result);
  }, [placements, onSubmit]);

  const activeMovie = activeId ? movieMap.get(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-2">
        {/* Tier rows */}
        {TIERS.map((tier) => (
          <TierRow key={tier} tier={tier} movieIds={placements[tier]} movieMap={movieMap} />
        ))}

        {/* Unranked pool */}
        <UnrankedPool movies={unrankedMovies} />

        {/* Dismiss zones */}
        {(onNotWatched || onMarkStale || onNA) && (
          <div className="flex gap-2 mt-4">
            {onNotWatched && <DismissDropZone zone="not-watched" />}
            {onMarkStale && <DismissDropZone zone="stale" />}
            {onNA && <DismissDropZone zone="n-a" />}
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-center pt-4">
          <Button onClick={handleSubmit} disabled={totalPlaced < 2 || submitPending}>
            {submitPending ? "Submitting\u2026" : `Submit Tier List (${totalPlaced} placed)`}
          </Button>
        </div>
      </div>

      <DragOverlay>{activeMovie ? <MovieCardOverlay movie={activeMovie} /> : null}</DragOverlay>
    </DndContext>
  );
}

function TierRow({
  tier,
  movieIds,
  movieMap,
}: {
  tier: Tier;
  movieIds: number[];
  movieMap: Map<number, TierMovie>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: tier });
  const movies = movieIds.map((id) => movieMap.get(id)).filter(Boolean) as TierMovie[];

  return (
    <div
      ref={setNodeRef}
      aria-label={`Tier ${tier}`}
      className={`flex items-stretch min-h-[80px] rounded-lg border transition-colors ${
        TIER_COLORS[tier]
      } ${isOver ? "ring-2 ring-primary" : ""}`}
    >
      <div
        className={`flex items-center justify-center w-14 shrink-0 rounded-l-lg font-bold text-2xl ${TIER_LABEL_COLORS[tier]}`}
      >
        {tier}
      </div>
      <SortableContext items={movieIds.map(String)} strategy={horizontalListSortingStrategy}>
        <div className="flex-1 flex items-center gap-2 p-2 min-h-[80px]">
          {movies.length === 0 && (
            <span className="text-muted-foreground text-sm px-2">Drop movies here</span>
          )}
          {movies.map((movie) => (
            <DraggableMovieCard key={movie.mediaId} movie={movie} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function UnrankedPool({ movies }: { movies: TierMovie[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: "unranked" });

  return (
    <div
      ref={setNodeRef}
      aria-label="Unranked movies"
      className={`mt-4 rounded-lg border border-dashed border-muted-foreground/30 p-3 transition-colors ${
        isOver ? "ring-2 ring-primary bg-muted/50" : "bg-muted/20"
      }`}
    >
      <h3 className="text-sm font-medium text-muted-foreground mb-2">Unranked ({movies.length})</h3>
      <SortableContext
        items={movies.map((m) => String(m.mediaId))}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex flex-wrap gap-2">
          {movies.length === 0 && (
            <span className="text-muted-foreground text-xs">All movies placed!</span>
          )}
          {movies.map((movie) => (
            <DraggableMovieCard key={movie.mediaId} movie={movie} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function DismissDropZone({ zone }: { zone: DismissZone }) {
  const config = DISMISS_ZONE_CONFIG[zone];
  const Icon = config.icon;
  const { setNodeRef, isOver } = useDroppable({ id: zone });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 flex items-center justify-center gap-2 rounded-lg border border-dashed p-3 transition-all ${config.color} ${
        isOver ? "ring-2 ring-primary scale-[1.02] border-solid" : ""
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="text-sm font-medium">{config.label}</span>
    </div>
  );
}

function DraggableMovieCard({ movie }: { movie: TierMovie }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(movie.mediaId),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      aria-label={movie.title}
      className="flex items-center gap-1.5 bg-background border rounded-md px-2 py-1.5 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow"
      data-testid={`movie-card-${movie.mediaId}`}
    >
      <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
      {movie.posterUrl ? (
        <img
          src={movie.posterUrl}
          alt={`${movie.title} poster`}
          className="w-8 h-12 rounded object-cover shrink-0"
        />
      ) : (
        <div className="w-8 h-12 rounded bg-muted flex items-center justify-center shrink-0">
          <ImageOff className="h-3 w-3 text-muted-foreground" />
        </div>
      )}
      <span className="text-xs font-medium truncate max-w-[100px]">{movie.title}</span>
    </div>
  );
}

function MovieCardOverlay({ movie }: { movie: TierMovie }) {
  return (
    <div className="flex items-center gap-1.5 bg-background border rounded-md px-2 py-1.5 shadow-lg ring-2 ring-primary">
      <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
      {movie.posterUrl ? (
        <img
          src={movie.posterUrl}
          alt={`${movie.title} poster`}
          className="w-8 h-12 rounded object-cover shrink-0"
        />
      ) : (
        <div className="w-8 h-12 rounded bg-muted flex items-center justify-center shrink-0">
          <ImageOff className="h-3 w-3 text-muted-foreground" />
        </div>
      )}
      <span className="text-xs font-medium truncate max-w-[100px]">{movie.title}</span>
    </div>
  );
}
