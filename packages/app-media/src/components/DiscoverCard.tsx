import { Bookmark, BookmarkCheck, Check, Eye, Loader2, Plus, RotateCw, X } from 'lucide-react';

/**
 * DiscoverCard — poster card for a TMDB discovery result.
 * Displays poster, title, year, TMDB rating, and action buttons.
 *
 * Uses CardWithActionOverlay for the poster shell.
 */
import { Badge, Button, cn } from '@pops/ui';

import { CardWithActionOverlay } from './CardWithActionOverlay';
import { MovieActionButtons } from './MovieActionButtons';

export interface DiscoverCardProps {
  tmdbId: number;
  title: string;
  releaseDate: string;
  posterPath: string | null;
  posterUrl: string | null;
  voteAverage: number;
  inLibrary: boolean;
  isWatched?: boolean;
  onWatchlist?: boolean;
  isAddingToLibrary?: boolean;
  isAddingToWatchlist?: boolean;
  isMarkingWatched?: boolean;
  isMarkingRewatched?: boolean;
  onAddToLibrary?: (tmdbId: number) => void;
  onAddToWatchlist?: (tmdbId: number) => void;
  onRemoveFromWatchlist?: (tmdbId: number) => void;
  isRemovingFromWatchlist?: boolean;
  onMarkWatched?: (tmdbId: number) => void;
  onMarkRewatched?: (tmdbId: number) => void;
  onNotInterested?: (tmdbId: number) => void;
  /** Whether a dismiss mutation is in progress for this card. */
  isDismissing?: boolean;
  /** Match percentage (0–100) from preference profile scoring. */
  matchPercentage?: number;
  /** Brief explanation of match, e.g. "Action, Sci-Fi". */
  matchReason?: string;
  className?: string;
}

export function DiscoverCard({
  tmdbId,
  title,
  releaseDate,
  posterUrl,
  voteAverage,
  inLibrary,
  isWatched,
  onWatchlist,
  isAddingToLibrary,
  isAddingToWatchlist,
  onAddToLibrary,
  onAddToWatchlist,
  onRemoveFromWatchlist,
  isRemovingFromWatchlist,
  onMarkWatched,
  isMarkingWatched,
  isMarkingRewatched,
  onMarkRewatched,
  onNotInterested,
  isDismissing,
  matchPercentage,
  matchReason,
  className,
}: DiscoverCardProps) {
  const year = releaseDate ? releaseDate.slice(0, 4) : null;

  const topLeft =
    voteAverage > 0 ? (
      <Badge variant="default" className="text-xs">
        {voteAverage.toFixed(1)}
      </Badge>
    ) : undefined;

  const topRight = isWatched ? (
    <Badge variant="secondary" className="gap-0.5 text-xs">
      <Eye className="h-3 w-3" />
      Watched
    </Badge>
  ) : inLibrary ? (
    <Badge variant="secondary" className="gap-0.5 text-xs">
      <Check className="h-3 w-3" />
      Owned
    </Badge>
  ) : undefined;

  const overlay = (
    <div className="flex gap-1">
      {!inLibrary && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-white hover:bg-white/20"
          onClick={() => onAddToLibrary?.(tmdbId)}
          disabled={isAddingToLibrary}
          title="Add to Library"
          aria-label="Add to Library"
        >
          {isAddingToLibrary ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-white hover:bg-white/20"
        onClick={() => (onWatchlist ? onRemoveFromWatchlist?.(tmdbId) : onAddToWatchlist?.(tmdbId))}
        disabled={isAddingToWatchlist || isRemovingFromWatchlist}
        title={onWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
        aria-label={onWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
      >
        {isAddingToWatchlist || isRemovingFromWatchlist ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : onWatchlist ? (
          <BookmarkCheck className="h-3.5 w-3.5" />
        ) : (
          <Bookmark className="h-3.5 w-3.5" />
        )}
      </Button>
      {isWatched ? (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-white hover:bg-white/20"
          onClick={() => onMarkRewatched?.(tmdbId)}
          disabled={isMarkingRewatched}
          title="Mark as Rewatched"
          aria-label="Mark as Rewatched"
        >
          {isMarkingRewatched ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
        </Button>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-white hover:bg-white/20"
          onClick={() => onMarkWatched?.(tmdbId)}
          disabled={isMarkingWatched}
          title="Mark as Watched"
          aria-label="Mark as Watched"
        >
          {isMarkingWatched ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
      {!inLibrary && (
        <MovieActionButtons
          tmdbId={tmdbId}
          title={title}
          year={year ? parseInt(year, 10) : new Date().getFullYear()}
          rating={voteAverage}
          variant="compact"
        />
      )}
      <Button
        size="icon"
        variant="ghost"
        className="ml-auto h-7 w-7 text-white hover:bg-white/20"
        onClick={() => onNotInterested?.(tmdbId)}
        disabled={isDismissing}
        title="Not Interested"
        aria-label="Not Interested"
      >
        {isDismissing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <X className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );

  return (
    <div className={cn('group flex w-36 shrink-0 flex-col gap-1.5 sm:w-40', className)}>
      <CardWithActionOverlay
        src={posterUrl}
        alt={`${title} poster`}
        topLeft={topLeft}
        topRight={topRight}
        overlay={overlay}
      />

      {/* Title + Year + Match info */}
      <div className="space-y-0.5 px-0.5">
        <h3 className="text-sm font-medium leading-tight line-clamp-2">{title}</h3>
        {year && <p className="text-xs text-muted-foreground">{year}</p>}
        {matchPercentage != null && matchPercentage > 0 && (
          <div className="flex items-center gap-1">
            <span
              className={cn(
                'text-xs font-semibold',
                matchPercentage >= 85
                  ? 'text-success'
                  : matchPercentage >= 70
                    ? 'text-success/70'
                    : 'text-muted-foreground'
              )}
            >
              {matchPercentage}% Match
            </span>
            {matchReason && (
              <span className="text-xs text-muted-foreground truncate">· {matchReason}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

DiscoverCard.displayName = 'DiscoverCard';
