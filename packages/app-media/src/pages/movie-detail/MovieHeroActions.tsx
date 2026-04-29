import { Link } from 'react-router';

import { Button } from '@pops/ui';

import { ArrStatusBadge } from '../../components/ArrStatusBadge';
import { FreshnessBadge } from '../../components/FreshnessBadge';
import { LeavingBadge } from '../../components/LeavingBadge';
import { MarkAsWatchedButton } from '../../components/MarkAsWatchedButton';
import { MovieActionButtons } from '../../components/MovieActionButtons';
import { WatchlistToggle } from '../../components/WatchlistToggle';

interface MovieHeroActionsProps {
  movie: {
    id: number;
    tmdbId: number;
    title: string;
    voteAverage: number | null;
    posterPath: string | null;
    rotationStatus: string | null;
    rotationExpiresAt: string | null;
  };
  year: number | null;
  daysSinceWatch: number | null;
  staleness: number;
  pendingDebrief: { movieId: number; status: string } | undefined;
}

export function MovieHeroActions({
  movie,
  year,
  daysSinceWatch,
  staleness,
  pendingDebrief,
}: MovieHeroActionsProps) {
  return (
    <div className="flex items-center gap-3 mt-3">
      <WatchlistToggle mediaType="movie" mediaId={movie.id} />
      <MarkAsWatchedButton mediaId={movie.id} />
      <ArrStatusBadge kind="movie" externalId={movie.tmdbId} />
      <MovieActionButtons
        tmdbId={movie.tmdbId}
        title={movie.title}
        year={year ?? new Date().getFullYear()}
        rating={movie.voteAverage ?? undefined}
        posterPath={movie.posterPath ?? undefined}
      />
      <FreshnessBadge daysSinceWatch={daysSinceWatch} staleness={staleness} />
      {movie.rotationStatus === 'leaving' && movie.rotationExpiresAt && (
        <LeavingBadge rotationExpiresAt={movie.rotationExpiresAt} />
      )}
      {pendingDebrief && (
        <Link to={`/media/debrief/${movie.id}`}>
          <Button variant="outline" size="sm">
            Debrief this movie
          </Button>
        </Link>
      )}
    </div>
  );
}
