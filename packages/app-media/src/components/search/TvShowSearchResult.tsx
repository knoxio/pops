import { Tv } from 'lucide-react';

import { Badge, cn, highlightMatch, SearchResultItem } from '@pops/ui';

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
    <SearchResultItem
      data-testid="tv-show-search-result"
      leading={
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
      }
      title={highlightMatch(name, query, matchType)}
      meta={[
        year && <span key="year">{year}</span>,
        numberOfSeasons != null && (
          <span key="seasons">
            {numberOfSeasons} {numberOfSeasons === 1 ? 'season' : 'seasons'}
          </span>
        ),
      ]}
      trailing={<StatusBadge status={status} />}
    />
  );
}
