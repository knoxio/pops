import { DiscoverCard } from '../DiscoverCard';
import { LeavingBadge } from '../LeavingBadge';

import type { DiscoverActionResult } from '../../hooks/useDiscoverCardActions';
import type { ShelfItem } from './types';

export interface ShelfItemCardProps {
  item: ShelfItem;
  addingToLibrary: Set<number>;
  addingToWatchlist: Set<number>;
  removingFromWatchlist: Set<number>;
  markingWatched: Set<number>;
  markingRewatched: Set<number>;
  dismissing: Set<number>;
  handleAddToLibrary: (tmdbId: number) => Promise<void>;
  handleAddToWatchlist: (tmdbId: number) => Promise<void>;
  handleRemoveFromWatchlist: (tmdbId: number) => Promise<void>;
  handleMarkWatched: (tmdbId: number) => Promise<void>;
  handleMarkRewatched: (tmdbId: number) => Promise<void>;
  onNotInterested: (tmdbId: number) => Promise<DiscoverActionResult>;
}

export function ShelfItemCard({
  item,
  addingToLibrary,
  addingToWatchlist,
  removingFromWatchlist,
  markingWatched,
  markingRewatched,
  dismissing,
  handleAddToLibrary,
  handleAddToWatchlist,
  handleRemoveFromWatchlist,
  handleMarkWatched,
  handleMarkRewatched,
  onNotInterested,
}: ShelfItemCardProps) {
  return (
    <div className="relative">
      <DiscoverCard
        tmdbId={item.tmdbId}
        title={item.title}
        releaseDate={item.releaseDate}
        posterPath={item.posterPath}
        posterUrl={item.posterUrl}
        voteAverage={item.voteAverage}
        inLibrary={item.inLibrary}
        isWatched={item.isWatched}
        onWatchlist={item.onWatchlist}
        matchPercentage={item.matchPercentage}
        matchReason={item.matchReason}
        isAddingToLibrary={addingToLibrary.has(item.tmdbId)}
        isAddingToWatchlist={addingToWatchlist.has(item.tmdbId)}
        isRemovingFromWatchlist={removingFromWatchlist.has(item.tmdbId)}
        isMarkingWatched={markingWatched.has(item.tmdbId)}
        isMarkingRewatched={markingRewatched.has(item.tmdbId)}
        isDismissing={dismissing.has(item.tmdbId)}
        onAddToLibrary={handleAddToLibrary}
        onAddToWatchlist={handleAddToWatchlist}
        onRemoveFromWatchlist={handleRemoveFromWatchlist}
        onMarkWatched={handleMarkWatched}
        onMarkRewatched={handleMarkRewatched}
        onNotInterested={onNotInterested}
      />
      {item.rotationExpiresAt && (
        <div className="absolute top-2 right-2 z-10">
          <LeavingBadge rotationExpiresAt={item.rotationExpiresAt} />
        </div>
      )}
    </div>
  );
}
