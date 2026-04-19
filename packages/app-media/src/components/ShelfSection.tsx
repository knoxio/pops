import { Loader2 } from 'lucide-react';

import { Button } from '@pops/ui';

import { HorizontalScrollRow } from './HorizontalScrollRow';
import { ShelfItemCard } from './shelf-section/ShelfItemCard';
import { ShelfPlaceholder } from './shelf-section/ShelfPlaceholder';
import { useShelfActions, type ShelfActionHandlers } from './shelf-section/useShelfActions';
import { useShelfPagination } from './shelf-section/useShelfPagination';

import type { DiscoverActionResult } from '../hooks/useDiscoverCardActions';
import type { ShelfItem } from './shelf-section/types';

export interface ShelfSectionProps extends ShelfActionHandlers {
  shelfId: string;
  title: string;
  subtitle?: string;
  emoji?: string;
  initialItems: ShelfItem[];
  hasMore: boolean;
  /** Set of tmdbIds to hide (dismissed). */
  dismissedSet: Set<number>;
  addingToLibrary: Set<number>;
  addingToWatchlist: Set<number>;
  removingFromWatchlist: Set<number>;
  markingWatched: Set<number>;
  markingRewatched: Set<number>;
  dismissing: Set<number>;
  onNotInterested: (tmdbId: number) => Promise<DiscoverActionResult>;
}

function LoadMoreButton({ loadingMore, onClick }: { loadingMore: boolean; onClick: () => void }) {
  return (
    <div className="flex shrink-0 items-center px-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={loadingMore}
        className="whitespace-nowrap"
      >
        {loadingMore ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Loading…
          </>
        ) : (
          'Show more'
        )}
      </Button>
    </div>
  );
}

export function ShelfSection(props: ShelfSectionProps) {
  const { shelfId, title, subtitle, initialItems, hasMore: initialHasMore, dismissedSet } = props;
  const pagination = useShelfPagination({ shelfId, initialItems, initialHasMore });
  const actions = useShelfActions(props, pagination.patchItem);

  const visibleItems = pagination.items.filter((item) => !dismissedSet.has(item.tmdbId));

  if (!pagination.isVisible) {
    return <ShelfPlaceholder sentinelRef={pagination.sentinelRef} />;
  }

  return (
    <div ref={pagination.sentinelRef} className="space-y-3">
      <HorizontalScrollRow title={title} subtitle={subtitle}>
        {visibleItems.map((item) => (
          <ShelfItemCard
            key={item.tmdbId}
            item={item}
            addingToLibrary={props.addingToLibrary}
            addingToWatchlist={props.addingToWatchlist}
            removingFromWatchlist={props.removingFromWatchlist}
            markingWatched={props.markingWatched}
            markingRewatched={props.markingRewatched}
            dismissing={props.dismissing}
            handleAddToLibrary={actions.handleAddToLibrary}
            handleAddToWatchlist={actions.handleAddToWatchlist}
            handleRemoveFromWatchlist={actions.handleRemoveFromWatchlist}
            handleMarkWatched={actions.handleMarkWatched}
            handleMarkRewatched={actions.handleMarkRewatched}
            onNotInterested={props.onNotInterested}
          />
        ))}
        {pagination.hasMore && (
          <LoadMoreButton
            loadingMore={pagination.loadingMore}
            onClick={pagination.handleShowMore}
          />
        )}
      </HorizontalScrollRow>
    </div>
  );
}
