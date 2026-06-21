import { useDroppable } from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable';

import { DraggableMovieCard } from './MovieCard';
import {
  DISMISS_ZONE_CONFIG,
  TIER_COLORS,
  TIER_LABEL_COLORS,
  type DismissZone,
  type Tier,
  type TierMovie,
} from './types';

export function TierRow({
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
      className={`flex items-stretch min-h-20 rounded-lg border transition-colors ${
        TIER_COLORS[tier]
      } ${isOver ? 'ring-2 ring-primary' : ''}`}
    >
      <div
        className={`flex items-center justify-center w-14 shrink-0 rounded-l-lg font-bold text-2xl ${TIER_LABEL_COLORS[tier]}`}
      >
        {tier}
      </div>
      <SortableContext items={movieIds.map(String)} strategy={horizontalListSortingStrategy}>
        <div className="flex-1 flex items-center gap-2 p-2 min-h-20">
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

export function UnrankedPool({ movies }: { movies: TierMovie[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unranked' });

  return (
    <div
      ref={setNodeRef}
      aria-label="Unranked movies"
      className={`mt-4 rounded-lg border border-dashed border-muted-foreground/30 p-3 transition-colors ${
        isOver ? 'ring-2 ring-primary bg-muted/50' : 'bg-muted/20'
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

export function DismissDropZone({ zone }: { zone: DismissZone }) {
  const config = DISMISS_ZONE_CONFIG[zone];
  const Icon = config.icon;
  const { setNodeRef, isOver } = useDroppable({ id: zone });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 flex items-center justify-center gap-2 rounded-lg border border-dashed p-3 transition-all ${config.color} ${
        isOver ? 'ring-2 ring-primary scale-[1.02] border-solid' : ''
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="text-sm font-medium">{config.label}</span>
    </div>
  );
}
