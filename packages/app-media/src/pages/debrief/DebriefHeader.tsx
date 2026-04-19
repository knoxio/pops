import { PosterImage } from './PosterImage';

import type { DebriefMovie } from './types';

interface DebriefHeaderProps {
  movie: DebriefMovie;
  pendingCount: number;
  allComplete: boolean;
}

export function DebriefHeader({ movie, pendingCount, allComplete }: DebriefHeaderProps) {
  return (
    <div className="flex items-center gap-4" data-testid="debrief-header">
      <PosterImage
        src={movie.posterUrl}
        alt={`${movie.title} poster`}
        className="h-36 w-24 shrink-0 rounded-md object-cover"
      />
      <div>
        <p className="text-muted-foreground text-sm">
          Debrief —{' '}
          {allComplete
            ? 'Complete'
            : `${pendingCount} dimension${pendingCount !== 1 ? 's' : ''} remaining`}
        </p>
      </div>
    </div>
  );
}
