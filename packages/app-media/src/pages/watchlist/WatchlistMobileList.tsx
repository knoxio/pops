import { WatchlistItem } from './WatchlistItem';

import type { MediaMeta, WatchlistEntry } from './types';

type WatchlistMobileListProps = {
  sortedEntries: WatchlistEntry[];
  hasManyItems: boolean;
  isReordering: boolean;
  removingId: number | null;
  updateErrorId: number | null;
  updateErrorMsg: string | null;
  getMetaForEntry: (entry: WatchlistEntry) => MediaMeta | undefined;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onRemove: (id: number) => void;
  onUpdateNotes: (id: number, notes: string | null) => void;
  isUpdatingEntry: (entryId: number) => boolean;
};

export function WatchlistMobileList({
  sortedEntries,
  hasManyItems,
  isReordering,
  removingId,
  updateErrorId,
  updateErrorMsg,
  getMetaForEntry,
  onMove,
  onRemove,
  onUpdateNotes,
  isUpdatingEntry,
}: WatchlistMobileListProps) {
  return (
    <div className="space-y-3 md:hidden" role="list" aria-label="Watchlist items">
      {sortedEntries.map((entry, index) => {
        const meta = getMetaForEntry(entry);

        return (
          <WatchlistItem
            key={entry.id}
            entry={entry}
            title={meta?.title ?? 'Unknown'}
            year={meta?.year ?? null}
            posterUrl={meta?.posterUrl ?? null}
            priority={index + 1}
            isFirst={index === 0}
            isLast={index === sortedEntries.length - 1}
            onMoveUp={() => onMove(index, 'up')}
            onMoveDown={() => onMove(index, 'down')}
            onRemove={onRemove}
            isRemoving={removingId === entry.id}
            isReordering={isReordering}
            showReorderControls={hasManyItems}
            onUpdateNotes={onUpdateNotes}
            isUpdating={isUpdatingEntry(entry.id)}
            updateError={updateErrorId === entry.id ? updateErrorMsg : null}
            rotationStatus={entry.mediaType === 'movie' ? meta?.rotationStatus : undefined}
            rotationExpiresAt={entry.mediaType === 'movie' ? meta?.rotationExpiresAt : undefined}
          />
        );
      })}
    </div>
  );
}
