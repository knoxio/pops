import { buildPosterUrl, SearchResultCard } from '../../components/SearchResultCard';
import { SearchSectionError, SearchSectionSkeleton } from './SearchSectionStates';

import type { TvSearchResult } from './types';

interface TvSectionLookups {
  tvTvdbIds: Set<number>;
  tvTvdbToLocalId: Map<number, number>;
}

interface TvSectionState {
  addedIds: Set<string>;
  addingIds: Set<string>;
  sessionTvLocalIds: Map<number, number>;
}

interface TvSectionHandlers {
  onAdd: (tvdbId: number) => void;
}

interface TvSearchSectionProps {
  showHeader: boolean;
  isLoading: boolean;
  error: { message: string } | null;
  onRetry: () => void;
  results: TvSearchResult[];
  lookups: TvSectionLookups;
  state: TvSectionState;
  handlers: TvSectionHandlers;
  makeKey: (type: 'movie' | 'tv', id: number) => string;
}

export function TvSearchSection({
  showHeader,
  isLoading,
  error,
  onRetry,
  results,
  lookups,
  state,
  handlers,
  makeKey,
}: TvSearchSectionProps) {
  return (
    <section>
      {showHeader && (
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">
          TV Shows{results.length > 0 ? ` (${results.length})` : ''}
        </h2>
      )}
      {isLoading && <SearchSectionSkeleton />}
      {error && (
        <SearchSectionError label="TV search failed" message={error.message} onRetry={onRetry} />
      )}
      {!isLoading && !error && results.length > 0 && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((show) => (
            <TvCard
              key={show.tvdbId}
              show={show}
              lookups={lookups}
              state={state}
              handlers={handlers}
              cardKey={makeKey('tv', show.tvdbId)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface TvCardProps {
  show: TvSearchResult;
  lookups: TvSectionLookups;
  state: TvSectionState;
  handlers: TvSectionHandlers;
  cardKey: string;
}

function TvCard({ show, lookups, state, handlers, cardKey }: TvCardProps) {
  const inLibrary = lookups.tvTvdbIds.has(show.tvdbId) || state.addedIds.has(cardKey);
  const localId =
    lookups.tvTvdbToLocalId.get(show.tvdbId) ?? state.sessionTvLocalIds.get(show.tvdbId);

  return (
    <SearchResultCard
      type="tv"
      title={show.name}
      year={show.year ?? show.firstAirDate?.slice(0, 4) ?? null}
      overview={show.overview}
      posterUrl={buildPosterUrl(show.posterPath, 'tv')}
      genres={show.genres}
      inLibrary={inLibrary}
      mediaId={localId}
      isAdding={state.addingIds.has(cardKey)}
      onAdd={() => handlers.onAdd(show.tvdbId)}
      onAddToWatchlistAndLibrary={undefined}
      href={localId != null ? `/media/tv/${localId}` : undefined}
    />
  );
}
