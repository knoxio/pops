import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ImageOff } from 'lucide-react';

import type { TierMovie } from './types';

function MovieThumb({ movie }: { movie: TierMovie }) {
  if (movie.posterUrl) {
    return (
      <img
        src={movie.posterUrl}
        alt={`${movie.title} poster`}
        className="w-8 h-12 rounded object-cover shrink-0"
      />
    );
  }
  return (
    <div className="w-8 h-12 rounded bg-muted flex items-center justify-center shrink-0">
      <ImageOff className="h-3 w-3 text-muted-foreground" />
    </div>
  );
}

export function DraggableMovieCard({ movie }: { movie: TierMovie }) {
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
      <MovieThumb movie={movie} />
      <span className="text-xs font-medium truncate max-w-25">{movie.title}</span>
    </div>
  );
}

export function MovieCardOverlay({ movie }: { movie: TierMovie }) {
  return (
    <div className="flex items-center gap-1.5 bg-background border rounded-md px-2 py-1.5 shadow-lg ring-2 ring-primary">
      <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
      <MovieThumb movie={movie} />
      <span className="text-xs font-medium truncate max-w-25">{movie.title}</span>
    </div>
  );
}
