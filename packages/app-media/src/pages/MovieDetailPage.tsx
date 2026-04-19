import { Link, useParams } from 'react-router';

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

function ErrorView({ error }: { error: { data?: { code?: string } | null; message: string } }) {
  const is404 = error.data?.code === 'NOT_FOUND';
  return (
    <div className="p-6">
      <Alert variant="destructive">
        <AlertTitle>{is404 ? 'Movie not found' : 'Error'}</AlertTitle>
        <AlertDescription>
          {is404 ? "This movie doesn't exist in your library." : error.message}
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
        pendingDebrief={model.pendingDebrief}
      />
      <MovieDetailContent movie={movie} watchHistory={model.watchHistoryData?.data} />
    </div>
  );
}
