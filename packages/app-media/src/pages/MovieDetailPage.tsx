import { Link, useParams } from 'react-router';

import { isNotFound } from '@pops/pillar-sdk/client';
import { Alert, AlertDescription, AlertTitle } from '@pops/ui';

import { MovieDetailContent } from './movie-detail/MovieDetailContent';
import { MovieDetailSkeleton } from './movie-detail/MovieDetailSkeleton';
import { MovieHero } from './movie-detail/MovieHero';
import { useMovieDetailModel } from './movie-detail/useMovieDetailModel';

function InvalidIdView() {
  return (
    <div className="p-6">
      <Alert variant="destructive">
        <AlertTitle>Invalid movie ID</AlertTitle>
        <AlertDescription>The movie ID must be a number.</AlertDescription>
      </Alert>
    </div>
  );
}

function ErrorView({ error }: { error: unknown }) {
  const is404 = isNotFound(error);
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="p-6">
      <Alert variant="destructive">
        <AlertTitle>{is404 ? 'Movie not found' : 'Error'}</AlertTitle>
        <AlertDescription>
          {is404 ? "This movie doesn't exist in your library." : message}
        </AlertDescription>
      </Alert>
      <Link to="/media" className="mt-4 inline-block text-sm text-primary underline">
        Back to library
      </Link>
    </div>
  );
}

export function MovieDetailPage() {
  const { id } = useParams<{ id: string }>();
  const movieId = Number(id);

  const model = useMovieDetailModel(movieId);

  if (Number.isNaN(movieId)) return <InvalidIdView />;
  if (model.isLoading) return <MovieDetailSkeleton />;
  if (model.error) return <ErrorView error={model.error} />;

  const movie = model.movie;
  if (!movie) return null;

  const year = movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null;

  return (
    <div>
      <MovieHero
        movie={movie}
        year={year}
        daysSinceWatch={model.daysSinceWatch}
        staleness={model.staleness}
      />
      <MovieDetailContent movie={movie} watchHistory={model.watchHistoryData?.data} />
    </div>
  );
}
