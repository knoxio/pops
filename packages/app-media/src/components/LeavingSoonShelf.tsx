/**
 * LeavingSoonShelf — horizontal shelf showing movies scheduled for removal.
 * Used on the Library page above the main grid.
 *
 * PRD-072 US-01
 */
import { Button, Skeleton } from '@pops/ui';
import { X } from 'lucide-react';
import { toast } from 'sonner';

import { trpc } from '../lib/trpc';
import { HorizontalScrollRow } from './HorizontalScrollRow';
import { LeavingBadge } from './LeavingBadge';
import { MediaCard } from './MediaCard';

export function LeavingSoonShelf() {
  const { data: movies, isLoading, refetch } = trpc.media.rotation.getLeavingMovies.useQuery();
  const cancelMutation = trpc.media.rotation.cancelLeaving.useMutation({
    onSuccess: (_data, variables) => {
      const movie = movies?.find((m) => m.id === variables.movieId);
      toast.success(`Kept "${movie?.title ?? 'movie'}" in library`);
      void refetch();
    },
    onError: () => {
      toast.error('Failed to cancel leaving status');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="px-1">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex gap-4 overflow-hidden pb-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="w-36 shrink-0 space-y-2 sm:w-40">
              <Skeleton className="aspect-[2/3] w-full rounded-md" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!movies || movies.length === 0) return null;

  return (
    <HorizontalScrollRow title="Leaving Soon" subtitle="Watch before they go">
      {movies.map((movie) => (
        <div key={movie.id} className="group relative w-36 shrink-0 sm:w-40">
          <MediaCard
            id={movie.id}
            type="movie"
            title={movie.title}
            posterUrl={movie.posterPath ? `/media/images/movie/${movie.tmdbId}/poster.jpg` : null}
            showTypeBadge={false}
          />

          {/* Leaving countdown badge */}
          {movie.rotationExpiresAt && (
            <div className="absolute top-2 right-2 z-10">
              <LeavingBadge rotationExpiresAt={movie.rotationExpiresAt} />
            </div>
          )}

          {/* Keep button */}
          <Button
            variant="secondary"
            size="icon"
            className="absolute bottom-12 right-1 z-10 h-7 w-7 rounded-full opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100 focus:opacity-100"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              cancelMutation.mutate({ movieId: movie.id });
            }}
            disabled={cancelMutation.isPending}
            title="Keep in library"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </HorizontalScrollRow>
  );
}

LeavingSoonShelf.displayName = 'LeavingSoonShelf';
