import { ComparisonMovieCard } from '../../components/ComparisonMovieCard';
import { DebriefDrawButtons } from './DebriefDrawButtons';

import type { DrawTier } from '../compare-arena/types';
import type { DebriefDimension, DebriefMovie } from './types';

interface CardCallbacks {
  onPick: (id: number) => void;
  onToggleWatchlist: (id: number) => void;
  onMarkStale: (id: number) => void;
  onNA: (id: number) => void;
  onBlacklist: (movie: { id: number; title: string }) => void;
}

interface CardFlags {
  isPending: boolean;
  watchlistedMovies: Map<number, number>;
  watchlistPending: boolean;
  stalePending: boolean;
  naPending: boolean;
  blacklistPending: boolean;
}

interface DebriefComparisonProps extends CardCallbacks, CardFlags {
  movie: DebriefMovie;
  dimension: DebriefDimension;
  onDraw: (tier: DrawTier) => void;
}

function buildCardProps(
  movie: { id: number; title: string; posterUrl: string | null },
  callbacks: CardCallbacks,
  flags: CardFlags
) {
  return {
    movie,
    onPick: () => callbacks.onPick(movie.id),
    disabled: flags.isPending,
    onToggleWatchlist: () => callbacks.onToggleWatchlist(movie.id),
    isOnWatchlist: flags.watchlistedMovies.has(movie.id),
    watchlistPending: flags.watchlistPending,
    onMarkStale: () => callbacks.onMarkStale(movie.id),
    stalePending: flags.stalePending,
    onNA: () => callbacks.onNA(movie.id),
    naPending: flags.naPending,
    onBlacklist: () => callbacks.onBlacklist(movie),
    blacklistPending: flags.blacklistPending,
  };
}

export function DebriefComparison({
  movie,
  dimension,
  onDraw,
  isPending,
  watchlistedMovies,
  watchlistPending,
  stalePending,
  naPending,
  blacklistPending,
  onPick,
  onToggleWatchlist,
  onMarkStale,
  onNA,
  onBlacklist,
}: DebriefComparisonProps) {
  if (!dimension.opponent) {
    return (
      <div className="text-muted-foreground py-8 text-center">
        <p>No opponent available for {dimension.name}.</p>
        <p className="text-sm">Skip this dimension to continue.</p>
      </div>
    );
  }

  const callbacks: CardCallbacks = {
    onPick,
    onToggleWatchlist,
    onMarkStale,
    onNA,
    onBlacklist,
  };
  const flags: CardFlags = {
    isPending,
    watchlistedMovies,
    watchlistPending,
    stalePending,
    naPending,
    blacklistPending,
  };

  const movieACard = buildCardProps(
    { id: movie.mediaId, title: movie.title, posterUrl: movie.posterUrl },
    callbacks,
    flags
  );

  const opponent = dimension.opponent;
  const movieBCard = buildCardProps(
    { id: opponent.id, title: opponent.title, posterUrl: opponent.posterUrl ?? null },
    callbacks,
    flags
  );

  return (
    <>
      <p className="text-muted-foreground text-center text-sm">
        Which has better <span className="text-foreground font-medium">{dimension.name}</span>?
      </p>
      <div className="relative grid grid-cols-2 gap-6" data-testid="comparison-cards">
        <ComparisonMovieCard {...movieACard} />
        <DebriefDrawButtons onDraw={onDraw} disabled={isPending} />
        <ComparisonMovieCard {...movieBCard} />
      </div>
    </>
  );
}
