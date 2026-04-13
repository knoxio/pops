/**
 * MovieSearchResult — ResultComponent for movies search hits.
 *
 * Renders poster thumbnail, title (highlighted), year, and vote average.
 * Registered for domain "movies" in the search result component registry.
 */
import type { ResultComponentProps } from '@pops/navigation';
import { Film, Star } from 'lucide-react';

interface MovieHitData {
  title: string;
  year: string | null;
  posterUrl: string | null;
  voteAverage: number | null;
}

/**
 * Highlight the matched portion of text based on query and match type.
 * Returns React nodes with the matched text wrapped in a <mark>.
 */
export function highlightMatch(text: string, query: string, matchType: string): React.ReactNode {
  if (!query) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const start = matchType === 'exact' || matchType === 'prefix' ? 0 : lowerText.indexOf(lowerQuery);

  if (start === -1) return text;

  const end = start + query.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="bg-yellow-200/60 dark:bg-yellow-500/30 rounded-sm px-0.5">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

function Rating({ value }: { value: number | null }) {
  if (value == null) return null;

  return (
    <span className="flex items-center gap-0.5" data-testid="rating">
      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
      <span>{value.toFixed(1)}</span>
    </span>
  );
}

export function MovieSearchResult({ data }: ResultComponentProps) {
  const hit = data as unknown as MovieHitData & {
    _query?: string;
    _matchType?: string;
  };
  const { title, year, posterUrl, voteAverage } = hit;
  const query = hit._query ?? '';
  const matchType = hit._matchType ?? 'contains';

  return (
    <div className="flex items-center gap-3 py-1" data-testid="movie-search-result">
      {/* Poster thumbnail */}
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

      {/* Text content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium leading-tight">
          {highlightMatch(title, query, matchType)}
        </span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {year && <span>{year}</span>}
          {year && voteAverage != null && <span>·</span>}
          <Rating value={voteAverage} />
        </div>
      </div>
    </div>
  );
}
