/**
 * WatchlistPage — displays the user's watchlist with reorder controls and inline notes.
 *
 * Items are ordered by priority (lower = higher in list).
 * Mobile: compact list with up/down reorder buttons.
 * Desktop (md+): responsive poster card grid with priority badges.
 */
import { Alert, AlertDescription, AlertTitle } from '@pops/ui';

import { useWatchlistPageModel } from './watchlist/useWatchlistPageModel';
import { WatchlistDesktopDnd } from './watchlist/WatchlistDesktopDnd';
import { WatchlistEmptyState } from './watchlist/WatchlistEmptyState';
import { WatchlistFilterTabs } from './watchlist/WatchlistFilterTabs';
import { WatchlistMobileList } from './watchlist/WatchlistMobileList';
import { WatchlistSkeleton } from './watchlist/WatchlistSkeleton';

export function WatchlistPage() {
  const {
    filter,
    setFilter,
    watchlistError,
    loading,
    entries,
    sortedEntries,
    hasManyItems,
    isReordering,
    removingId,
    updateErrorId,
    updateErrorMsg,
    activeId,
    sensors,
    collisionDetection,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    handleMove,
    getMetaForEntry,
    onRemove,
    onUpdateNotes,
    updateMutation,
  } = useWatchlistPageModel();

  if (watchlistError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load watchlist. Please try again.</AlertDescription>
      </Alert>
    );
  }

  const isUpdatingEntry = (entryId: number) =>
    updateMutation.isPending && updateMutation.variables?.id === entryId;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Watchlist</h1>

      <WatchlistFilterTabs filter={filter} onFilterChange={setFilter} />

      {loading ? (
        <WatchlistSkeleton />
      ) : entries.length === 0 ? (
        <WatchlistEmptyState filter={filter} />
      ) : (
        <>
          <WatchlistMobileList
            sortedEntries={sortedEntries}
            hasManyItems={hasManyItems}
            isReordering={isReordering}
            removingId={removingId}
            updateErrorId={updateErrorId}
            updateErrorMsg={updateErrorMsg}
            getMetaForEntry={getMetaForEntry}
            onMove={handleMove}
            onRemove={onRemove}
            onUpdateNotes={onUpdateNotes}
            isUpdatingEntry={isUpdatingEntry}
          />

          <WatchlistDesktopDnd
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
            sortedEntries={sortedEntries}
            hasManyItems={hasManyItems}
            removingId={removingId}
            activeId={activeId}
            getMetaForEntry={getMetaForEntry}
            onRemove={onRemove}
          />
        </>
      )}
    </div>
  );
}
