/**
 * ComparisonMovieCard — single movie card with zone-based action layout.
 *
 * Used in the Compare Arena and Debrief pages. Contains:
 * - Main clickable poster area (picks the movie as winner)
 * - Top-left overlay: watchlist bookmark toggle (non-dismissing)
 * - Top-right overlay: score delta badge (optional)
 * - Bottom overlay: dismissing actions (N/A, stale, blacklist) revealed on hover/focus
 * - Title below poster (also picks winner on click)
 *
 * Uses CardWithActionOverlay for the poster shell.
 */
import { CardWithActionOverlay, Skeleton } from '@pops/ui';

import { CardActionsOverlay, ScoreDeltaBadge, WatchlistButton } from './ComparisonMovieCardActions';

export interface ComparisonMovieCardMovie {
  id: number;
  title: string;
  posterUrl: string | null;
}

export interface ComparisonMovieCardProps {
  movie: ComparisonMovieCardMovie;
  onPick: () => void;
  disabled?: boolean;
  /** ELO score delta shown as an animated badge (positive = gain, negative = loss). */
  scoreDelta?: number | null;
  /** Whether this card won the last comparison. `undefined` = neutral, `false` = lost. */
  isWinner?: boolean;
  onToggleWatchlist?: () => void;
  isOnWatchlist?: boolean;
  watchlistPending?: boolean;
  onMarkStale?: () => void;
  stalePending?: boolean;
  onNA?: () => void;
  naPending?: boolean;
  onBlacklist?: () => void;
  blacklistPending?: boolean;
}

function getRingClass(
  isWinner: boolean | undefined,
  scoreDelta: number | null | undefined
): string {
  if (isWinner) return 'ring-2 ring-success shadow-lg scale-[1.02]';
  if (isWinner === false && scoreDelta != null) return 'ring-2 ring-destructive/50 opacity-75';
  return '';
}

export function ComparisonMovieCard(props: ComparisonMovieCardProps) {
  const { movie, onPick, disabled, scoreDelta, isWinner, onToggleWatchlist } = props;

  const topLeft = onToggleWatchlist ? (
    <WatchlistButton
      movie={movie}
      onToggle={onToggleWatchlist}
      isOnWatchlist={props.isOnWatchlist}
      pending={props.watchlistPending}
    />
  ) : undefined;

  const topRight =
    scoreDelta != null ? <ScoreDeltaBadge movieId={movie.id} scoreDelta={scoreDelta} /> : undefined;

  const overlay = <CardActionsOverlay {...props} movie={movie} />;

  return (
    <div className="flex flex-col gap-2" data-testid={`comparison-movie-card-${movie.id}`}>
      <div
        className={`relative rounded-lg overflow-hidden transition-all ${getRingClass(isWinner, scoreDelta)}`}
      >
        <CardWithActionOverlay
          src={movie.posterUrl}
          alt={`${movie.title} poster`}
          ariaLabel={`Pick ${movie.title}`}
          onClick={onPick}
          disabled={disabled}
          topLeft={topLeft}
          topRight={topRight}
          overlay={overlay}
          overlayGradient="from-black/60"
          lazy={false}
          className="rounded-none"
        />
      </div>

      <button
        onClick={onPick}
        disabled={disabled}
        className={`font-semibold text-sm text-center truncate px-1 transition-colors hover:text-primary ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      >
        {movie.title}
      </button>
    </div>
  );
}

export function ComparisonMovieCardSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="w-full aspect-[2/3] rounded-lg" />
      <Skeleton className="h-4 w-24 mx-auto" />
    </div>
  );
}
