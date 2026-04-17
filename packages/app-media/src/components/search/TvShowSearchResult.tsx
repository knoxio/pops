import { Tv } from 'lucide-react';

import { Badge, cn } from '@pops/ui';

/**
 * TvShowSearchResult — ResultComponent for tv-shows search hits.
 *
 * Renders poster thumbnail, name (highlighted), year, status badge, and season count.
 * Registered for domain "tv-shows" in the search result component registry.
 */
import type { ResultComponentProps } from '@pops/navigation';

interface TvShowHitData {
  name: string;
  year: string | null;
  posterUrl: string | null;
  status: string | null;
  numberOfSeasons: number | null;
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
      <mark className="bg-warning/20 rounded-sm px-0.5">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;

  const isContinuing = status.toLowerCase() === 'continuing';
  return (
    <Badge
      variant={isContinuing ? 'default' : 'secondary'}
      className={cn('text-2xs', isContinuing && 'bg-info text-info-foreground hover:bg-info')}
      data-testid="status-badge"
    >
      {status}
    </Badge>
  );
}

export function TvShowSearchResult({ data }: ResultComponentProps) {
  const hit = data as unknown as TvShowHitData & {
    _query?: string;
    _matchType?: string;
  };
  const { name, year, posterUrl, status, numberOfSeasons } = hit;
  const query = hit._query ?? '';
  const matchType = hit._matchType ?? 'contains';

  return (
    <div className="flex items-center gap-3 py-1" data-testid="tv-show-search-result">
      {/* Poster thumbnail */}
      <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-muted">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={`${name} poster`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Tv className="h-4 w-4 opacity-40" />
          </div>
        )}
      </div>

      {/* Text content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium leading-tight truncate">
          {highlightMatch(name, query, matchType)}
        </span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {year && <span>{year}</span>}
          {numberOfSeasons != null && (
            <>
              {year && <span>·</span>}
              <span>
                {numberOfSeasons} {numberOfSeasons === 1 ? 'season' : 'seasons'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Status badge */}
      <StatusBadge status={status} />
    </div>
  );
}
