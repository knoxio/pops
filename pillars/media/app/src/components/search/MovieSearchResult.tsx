import { Film, Star } from 'lucide-react';

import { highlightMatch, SearchResultItem } from '@pops/ui';

import { formatRuntime } from '../../lib/format';

/**
 * MovieSearchResult — ResultComponent for movies search hits.
 *
 * Renders poster thumbnail, title (highlighted), year, and vote average.
 * Registered for domain "movies" in the search result component registry.
 */
import type { ResultComponentProps } from '@pops/navigation';

interface MovieHitData extends Record<string, unknown> {
  title: string;
  year: string | null;
  posterUrl: string | null;
  voteAverage: number | null;
  runtime: number | null;
}

function Rating({ value }: { value: number | null }) {
  if (value == null) return null;

  return (
    <span className="flex items-center gap-0.5" data-testid="rating">
      <Star className="h-3 w-3 fill-warning text-warning" />
      <span>{value.toFixed(1)}</span>
    </span>
  );
}

function formatRuntimeOrNull(minutes: number | null): string | null {
  if (minutes == null || minutes <= 0) return null;
  return formatRuntime(minutes);
}

export function MovieSearchResult({
  data,
  query = '',
  matchType = 'contains',
}: ResultComponentProps<MovieHitData>) {
  const { title, year, posterUrl, voteAverage, runtime } = data;
  const runtimeLabel = formatRuntimeOrNull(runtime ?? null);

  return (
    <SearchResultItem
      data-testid="movie-search-result"
      leading={
        <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-muted">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={`${title} poster`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Film className="h-4 w-4 opacity-40" />
            </div>
          )}
        </div>
      }
      title={highlightMatch(title, query, matchType)}
      meta={[
        year && <span key="year">{year}</span>,
        voteAverage != null && <Rating key="rating" value={voteAverage} />,
        runtimeLabel && (
          <span key="runtime" data-testid="runtime">
            {runtimeLabel}
          </span>
        ),
      ]}
    />
  );
}
