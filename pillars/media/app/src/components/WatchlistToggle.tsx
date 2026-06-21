import { Bookmark, BookmarkCheck } from 'lucide-react';

import { Button } from '@pops/ui';

import { useWatchlistToggleModel } from './watchlist-toggle/useWatchlistToggleModel';

type DisplayMediaType = 'movie' | 'tv';
type ApiMediaType = 'movie' | 'tv_show';

const toApiMediaType = (type: DisplayMediaType): ApiMediaType => (type === 'tv' ? 'tv_show' : type);

export interface WatchlistToggleProps {
  mediaType: DisplayMediaType;
  mediaId: number;
  className?: string;
}

export function WatchlistToggle({ mediaType, mediaId, className }: WatchlistToggleProps) {
  const apiMediaType = toApiMediaType(mediaType);
  const { isChecking, isOnWatchlist, isMutating, handleToggle } = useWatchlistToggleModel(
    apiMediaType,
    mediaId
  );

  if (isChecking) {
    return (
      <Button
        variant="outline"
        size="sm"
        loading
        loadingText="Checking watchlist"
        aria-label="Checking watchlist status"
        className={className}
      >
        Loading
      </Button>
    );
  }

  return (
    <Button
      variant={isOnWatchlist ? 'default' : 'outline'}
      size="sm"
      onClick={handleToggle}
      loading={isMutating}
      loadingText={isOnWatchlist ? 'Removing' : 'Adding'}
      prefix={
        isOnWatchlist ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />
      }
      aria-label={isOnWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
      className={className}
    >
      {isOnWatchlist ? 'On Watchlist' : 'Add to Watchlist'}
    </Button>
  );
}
