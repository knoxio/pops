import { Ban, Bookmark, Clock, EyeOff } from 'lucide-react';

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
import { Skeleton, Tooltip, TooltipContent, TooltipTrigger } from '@pops/ui';

import { CardWithActionOverlay } from './CardWithActionOverlay';

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

export function ComparisonMovieCard({
  movie,
  onPick,
  disabled,
  scoreDelta,
  isWinner,
  onToggleWatchlist,
  isOnWatchlist,
  watchlistPending,
  onMarkStale,
  stalePending,
  onNA,
  naPending,
  onBlacklist,
  blacklistPending,
}: ComparisonMovieCardProps) {
  const topLeft = onToggleWatchlist ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleWatchlist();
          }}
          disabled={watchlistPending}
          className={`p-1.5 rounded-full backdrop-blur-sm transition-colors ${
            isOnWatchlist
              ? 'bg-app-accent/90 text-app-accent-foreground hover:bg-destructive/90 hover:text-white'
              : 'bg-black/50 text-white/80 hover:text-white hover:bg-black/70'
          }`}
          aria-label={
            isOnWatchlist
              ? `Remove ${movie.title} from watchlist`
              : `Add ${movie.title} to watchlist`
          }
          data-testid={`watchlist-button-${movie.id}`}
        >
          <Bookmark className={`h-4 w-4 ${isOnWatchlist ? 'fill-current' : ''}`} />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {isOnWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
      </TooltipContent>
    </Tooltip>
  ) : undefined;

  const topRight =
    scoreDelta != null ? (
      <div
        className={`px-2 py-1 rounded-full text-xs font-bold tabular-nums animate-bounce ${
          scoreDelta > 0 ? 'bg-success/90 text-white' : 'bg-destructive/90 text-white'
        }`}
        data-testid={`score-delta-${movie.id}`}
      >
        {scoreDelta > 0 ? '+' : ''}
        {scoreDelta}
      </div>
    ) : undefined;

  const overlay =
    (onNA ?? onMarkStale ?? onBlacklist) ? (
      <div className="flex justify-center gap-2">
        {onNA && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNA();
                }}
                disabled={naPending}
                className="p-2 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 backdrop-blur-sm transition-colors"
                aria-label={`N/A: ${movie.title}`}
                data-testid={`na-button-${movie.id}`}
              >
                <Ban className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>N/A — exclude from this dimension</TooltipContent>
          </Tooltip>
        )}
        {onMarkStale && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkStale();
                }}
                disabled={stalePending}
                className="p-2 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 backdrop-blur-sm transition-colors"
                aria-label={`Mark ${movie.title} as stale`}
                data-testid={`stale-button-${movie.id}`}
              >
                <Clock className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Stale — reduce score weight</TooltipContent>
          </Tooltip>
        )}
        {onBlacklist && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onBlacklist();
                }}
                disabled={blacklistPending}
                className="p-2 rounded-full bg-black/40 text-white/80 hover:text-destructive/80 hover:bg-black/60 backdrop-blur-sm transition-colors"
                aria-label={`Not watched ${movie.title}`}
                data-testid={`blacklist-button-${movie.id}`}
              >
                <EyeOff className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Not watched</TooltipContent>
          </Tooltip>
        )}
      </div>
    ) : undefined;

  return (
    <div className="flex flex-col gap-2" data-testid={`comparison-movie-card-${movie.id}`}>
      <div
        className={`relative rounded-lg overflow-hidden transition-all ${
          isWinner
            ? 'ring-2 ring-success shadow-lg scale-[1.02]'
            : isWinner === false && scoreDelta != null
              ? 'ring-2 ring-destructive/50 opacity-75'
              : ''
        }`}
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

      {/* Title — clickable, same as picking winner */}
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
