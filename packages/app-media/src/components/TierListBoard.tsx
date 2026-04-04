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
  closestCenter,
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
import { ImageOff, GripVertical } from "lucide-react";

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

interface TierListBoardProps {
  movies: TierMovie[];
  onSubmit: (placements: Array<{ movieId: number; tier: Tier }>) => void;
  submitPending?: boolean;
}

export function TierListBoard({ movies, onSubmit, submitPending }: TierListBoardProps) {
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

  const findContainer = useCallback(
    (id: number): Tier | "unranked" => {
      for (const tier of TIERS) {
        if (placements[tier].includes(id)) return tier;
      }
      return "unranked";
    },
    [placements]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(Number(event.active.id));
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeIdNum = Number(active.id);
      const overId = String(over.id);

      const sourceContainer = findContainer(activeIdNum);

      // Determine target: if overId is a tier name, target that tier; otherwise find which tier contains the over item
      let targetContainer: Tier | "unranked";
      if (TIERS.includes(overId as Tier)) {
        targetContainer = overId as Tier;
      } else if (overId === "unranked") {
        targetContainer = "unranked";
      } else {
        targetContainer = findContainer(Number(overId));
      }

      if (sourceContainer === targetContainer) return;

      setPlacements((prev) => {
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
    },
    [findContainer]
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeIdNum = Number(active.id);
    const overId = String(over.id);

    // If dropped on unranked zone, remove from all tiers
    if (overId === "unranked") {
      setPlacements((prev) => {
        const next = { ...prev };
        for (const tier of TIERS) {
          next[tier] = prev[tier].filter((id) => id !== activeIdNum);
        }
        return next;
      });
      return;
    }

    // If dropped on a tier label, ensure it's in that tier
    if (TIERS.includes(overId as Tier)) {
      const targetTier = overId as Tier;
      setPlacements((prev) => {
        const next = { ...prev };
        // Remove from all other tiers
        for (const tier of TIERS) {
          next[tier] = prev[tier].filter((id) => id !== activeIdNum);
        }
        // Add to target
        if (!next[targetTier].includes(activeIdNum)) {
          next[targetTier] = [...next[targetTier], activeIdNum];
        }
        return next;
      });
    }
  }, []);

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
      collisionDetection={closestCenter}
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
