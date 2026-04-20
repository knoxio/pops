import { Bookmark, BookmarkCheck, Eye, Loader2, Plus, RotateCw, X } from 'lucide-react';

import { Button } from '@pops/ui';

import { MovieActionButtons } from '../MovieActionButtons';

import type { DiscoverCardProps } from '../DiscoverCard';

function IconButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-7 w-7 text-white hover:bg-white/20"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
    >
      {children}
    </Button>
  );
}

function AddLibraryButton({
  tmdbId,
  isAddingToLibrary,
  onAddToLibrary,
}: Pick<DiscoverCardProps, 'tmdbId' | 'isAddingToLibrary' | 'onAddToLibrary'>) {
  return (
    <IconButton
      onClick={() => onAddToLibrary?.(tmdbId)}
      disabled={isAddingToLibrary}
      title="Add to Library"
    >
      {isAddingToLibrary ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Plus className="h-3.5 w-3.5" />
      )}
    </IconButton>
  );
}

function WatchlistToggleButton({
  tmdbId,
  onWatchlist,
  isAddingToWatchlist,
  isRemovingFromWatchlist,
  onAddToWatchlist,
  onRemoveFromWatchlist,
}: Pick<
  DiscoverCardProps,
  | 'tmdbId'
  | 'onWatchlist'
  | 'isAddingToWatchlist'
  | 'isRemovingFromWatchlist'
  | 'onAddToWatchlist'
  | 'onRemoveFromWatchlist'
>) {
  const title = onWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist';
  const renderIcon = () => {
    if (isAddingToWatchlist || isRemovingFromWatchlist) {
      return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    }
    if (onWatchlist) return <BookmarkCheck className="h-3.5 w-3.5" />;
    return <Bookmark className="h-3.5 w-3.5" />;
  };
  return (
    <IconButton
      onClick={() => (onWatchlist ? onRemoveFromWatchlist?.(tmdbId) : onAddToWatchlist?.(tmdbId))}
      disabled={isAddingToWatchlist ?? isRemovingFromWatchlist}
      title={title}
    >
      {renderIcon()}
    </IconButton>
  );
}

function WatchedToggleButton({
  tmdbId,
  isWatched,
  isMarkingWatched,
  isMarkingRewatched,
  onMarkWatched,
  onMarkRewatched,
}: Pick<
  DiscoverCardProps,
  | 'tmdbId'
  | 'isWatched'
  | 'isMarkingWatched'
  | 'isMarkingRewatched'
  | 'onMarkWatched'
  | 'onMarkRewatched'
>) {
  if (isWatched) {
    return (
      <IconButton
        onClick={() => onMarkRewatched?.(tmdbId)}
        disabled={isMarkingRewatched}
        title="Mark as Rewatched"
      >
        {isMarkingRewatched ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RotateCw className="h-3.5 w-3.5" />
        )}
      </IconButton>
    );
  }
  return (
    <IconButton
      onClick={() => onMarkWatched?.(tmdbId)}
      disabled={isMarkingWatched}
      title="Mark as Watched"
    >
      {isMarkingWatched ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Eye className="h-3.5 w-3.5" />
      )}
    </IconButton>
  );
}

export function DiscoverCardOverlay(props: DiscoverCardProps & { year: string | null }) {
  const { tmdbId, title, year, voteAverage, inLibrary, onNotInterested, isDismissing } = props;
  return (
    <div className="flex gap-1">
      {!inLibrary && <AddLibraryButton {...props} />}
      <WatchlistToggleButton {...props} />
      <WatchedToggleButton {...props} />
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
}
