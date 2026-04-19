import { ComparisonMovieCard } from '../../components/ComparisonMovieCard';
import { DrawTierButtons } from '../../components/DrawTierButtons';

import type { DrawTier, PairData, ScoreDelta } from './types';

interface ArenaCardCallbacks {
  onPick: (movieId: number) => void;
  onToggleWatchlist: (movieId: number) => void;
  onMarkStale: (movieId: number) => void;
  onNA: (movieId: number) => void;
  onBlacklist: (movie: { id: number; title: string }) => void;
}

interface ArenaCardFlags {
  watchlistedMovies: Map<number, number>;
  watchlistPending: boolean;
  stalePending: boolean;
  naPending: boolean;
  blacklistPending: boolean;
  isPending: boolean;
}

interface ArenaPairProps extends ArenaCardCallbacks, ArenaCardFlags {
  pair: PairData;
  scoreDelta: ScoreDelta | null;
  onDraw: (tier: DrawTier) => void;
  onSkip: () => void;
  skipPending: boolean;
}

function deltaForCard(scoreDelta: ScoreDelta | null, movieId: number): number | null {
  if (!scoreDelta) return null;
  if (scoreDelta.winnerId === movieId) return scoreDelta.winnerDelta;
  if (scoreDelta.loserId === movieId) return scoreDelta.loserDelta;
  return null;
}

function winnerForCard(scoreDelta: ScoreDelta | null, movieId: number): boolean | undefined {
  if (!scoreDelta || scoreDelta.isDraw) return undefined;
  return scoreDelta.winnerId === movieId;
}

export function ArenaPair({
  pair,
  scoreDelta,
  onDraw,
  onSkip,
  skipPending,
  watchlistedMovies,
  watchlistPending,
  stalePending,
  naPending,
  blacklistPending,
  isPending,
  onPick,
  onToggleWatchlist,
  onMarkStale,
  onNA,
  onBlacklist,
}: ArenaPairProps) {
  const renderCard = (movie: PairData['movieA']) => (
    <ComparisonMovieCard
      movie={movie}
      onPick={() => onPick(movie.id)}
      disabled={isPending}
      scoreDelta={deltaForCard(scoreDelta, movie.id)}
      isWinner={winnerForCard(scoreDelta, movie.id)}
      onToggleWatchlist={() => onToggleWatchlist(movie.id)}
      isOnWatchlist={watchlistedMovies.has(movie.id)}
      watchlistPending={watchlistPending}
      onMarkStale={() => onMarkStale(movie.id)}
      stalePending={stalePending}
      onNA={() => onNA(movie.id)}
      naPending={naPending}
      onBlacklist={() => onBlacklist(movie)}
      blacklistPending={blacklistPending}
    />
  );

  return (
    <div className="relative grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
      {renderCard(pair.movieA)}
      <DrawTierButtons
        onDraw={onDraw}
        onSkip={onSkip}
        disabled={isPending}
        skipPending={skipPending}
      />
      {renderCard(pair.movieB)}
    </div>
  );
}
