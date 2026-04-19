import { Link } from 'react-router';

import { Badge } from '@pops/ui';

import { ComparisonScores } from '../../components/ComparisonScores';
import { ExcludedDimensions } from '../../components/ExcludedDimensions';
import { formatCurrency, formatLanguage, formatRuntime } from '../../lib/format';

interface Movie {
  id: number;
  status: string | null;
  originalLanguage: string | null;
  budget: number | null;
  revenue: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  runtime: number | null;
  overview: string | null;
  genres: string[];
}

interface WatchEntry {
  id: number;
  watchedAt: string;
}

function buildMetadata(movie: Movie) {
  return [
    { label: 'Status', value: movie.status as string | null },
    {
      label: 'Language',
      value: movie.originalLanguage ? formatLanguage(movie.originalLanguage) : null,
    },
    { label: 'Budget', value: movie.budget ? formatCurrency(movie.budget) : null },
    { label: 'Revenue', value: movie.revenue ? formatCurrency(movie.revenue) : null },
    {
      label: 'TMDB Rating',
      value: movie.voteAverage
        ? `${movie.voteAverage.toFixed(1)} (${movie.voteCount} votes)`
        : null,
    },
    { label: 'Runtime', value: movie.runtime ? formatRuntime(movie.runtime) : null },
  ].filter((item) => item.value != null);
}

function GenreSection({ genres }: { genres: string[] }) {
  if (genres.length === 0) return null;
  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">Genres</h2>
      <div className="flex flex-wrap gap-2">
        {genres.map((genre) => (
          <Link key={genre} to={`/media?genre=${encodeURIComponent(genre)}`}>
            <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
              {genre}
            </Badge>
          </Link>
        ))}
      </div>
    </section>
  );
}

function MetadataSection({ items }: { items: { label: string; value: string | null }[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">Details</h2>
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-sm text-muted-foreground">{item.label}</dt>
            <dd className="text-sm font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function WatchHistorySection({ entries }: { entries: WatchEntry[] | undefined }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">Watch History</h2>
      {entries && entries.length > 0 ? (
        <ul className="space-y-2">
          {[...entries]
            .toSorted((a, b) => new Date(a.watchedAt).getTime() - new Date(b.watchedAt).getTime())
            .map((entry) => (
              <li key={entry.id} className="text-sm text-muted-foreground">
                {new Date(entry.watchedAt).toLocaleDateString('en-AU', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Not watched yet</p>
      )}
    </section>
  );
}

export function MovieDetailContent({
  movie,
  watchHistory,
}: {
  movie: Movie;
  watchHistory: WatchEntry[] | undefined;
}) {
  const metadataItems = buildMetadata(movie);
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {movie.overview && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Overview</h2>
          <p className="text-muted-foreground leading-relaxed">{movie.overview}</p>
        </section>
      )}
      <GenreSection genres={movie.genres} />
      <ComparisonScores mediaType="movie" mediaId={movie.id} />
      <ExcludedDimensions mediaType="movie" mediaId={movie.id} />
      <MetadataSection items={metadataItems} />
      <WatchHistorySection entries={watchHistory} />
    </div>
  );
}
