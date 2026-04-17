import { Ban, Bookmark, Clock, EyeOff, ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * ComparisonMovieCard — single movie card with zone-based action layout.
 *
 * Used in the Compare Arena and Debrief pages. Contains:
 * - Main clickable poster area (picks the movie as winner)
 * - Top-left overlay: watchlist bookmark toggle (non-dismissing)
 * - Top-right overlay: score delta badge (optional)
 * - Bottom overlay: dismissing actions (N/A, stale, blacklist) revealed on hover/focus
 * - Title below poster (also picks winner on click)
 */
import { Skeleton, Tooltip, TooltipContent, TooltipTrigger } from '@pops/ui';

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
  const posterSrc = movie.posterUrl ?? undefined;
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [posterSrc]);

  return (
    <div className="flex flex-col gap-2" data-testid={`comparison-movie-card-${movie.id}`}>
      <div
        className={`group relative rounded-lg overflow-hidden transition-all ${
          isWinner
            ? 'ring-2 ring-success shadow-lg scale-[1.02]'
            : isWinner === false && scoreDelta != null
              ? 'ring-2 ring-destructive/50 opacity-75'
              : ''
        }`}
      >
        {/* Main clickable poster area */}
        <button
          onClick={onPick}
          disabled={disabled}
          aria-label={`Pick ${movie.title}`}
          className={`w-full block ${disabled ? 'cursor-default' : 'cursor-pointer active:scale-[0.98]'} transition-transform`}
        >
          {imgError || !posterSrc ? (
            <div className="w-full aspect-[2/3] bg-muted flex items-center justify-center">
              <ImageOff className="h-8 w-8 text-muted-foreground" />
            </div>
          ) : (
            <img
              src={posterSrc}
              alt={`${movie.title} poster`}
              className="w-full aspect-[2/3] object-cover"
              onError={() => {
                setImgError(true);
              }}
            />
          )}
        </button>

        {/* TOP ZONE — non-dismissing actions */}
        {onToggleWatchlist && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleWatchlist();
                }}
                disabled={watchlistPending}
                className={`absolute top-2 left-2 p-1.5 rounded-full backdrop-blur-sm transition-colors ${
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
        )}

        {/* Score delta badge */}
        {scoreDelta != null && (
          <div
            className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-bold tabular-nums animate-bounce ${
              scoreDelta > 0 ? 'bg-success/90 text-white' : 'bg-destructive/90 text-white'
            }`}
            data-testid={`score-delta-${movie.id}`}
          >
            {scoreDelta > 0 ? '+' : ''}
            {scoreDelta}
          </div>
        )}

        {/* BOTTOM ZONE — dismissing actions (visible on hover/touch) */}
        {(onNA ?? onMarkStale ?? onBlacklist) && (
          <div className="absolute bottom-0 inset-x-0 flex justify-center gap-2 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
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
        )}
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
