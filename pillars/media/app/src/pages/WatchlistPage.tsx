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
import { WatchlistPlexSyncButton } from './watchlist/WatchlistPlexSyncButton';
import { WatchlistSkeleton } from './watchlist/WatchlistSkeleton';

type Model = ReturnType<typeof useWatchlistPageModel>;

function WatchlistContent({ model }: { model: Model }) {
  const isUpdatingEntry = (entryId: number) =>
    model.updateMutation.isPending && model.updateMutation.variables?.id === entryId;

  return (
    <>
      <WatchlistMobileList
        sortedEntries={model.sortedEntries}
        hasManyItems={model.hasManyItems}
        isReordering={model.isReordering}
        removingId={model.removingId}
        updateErrorId={model.updateErrorId}
        updateErrorMsg={model.updateErrorMsg}
        getMetaForEntry={model.getMetaForEntry}
        onMove={model.handleMove}
        onRemove={model.onRemove}
        onUpdateNotes={model.onUpdateNotes}
        isUpdatingEntry={isUpdatingEntry}
      />
      <WatchlistDesktopDnd
        sensors={model.sensors}
        collisionDetection={model.collisionDetection}
        onDragStart={model.handleDragStart}
        onDragEnd={model.handleDragEnd}
        onDragCancel={model.handleDragCancel}
        sortedEntries={model.sortedEntries}
        hasManyItems={model.hasManyItems}
        removingId={model.removingId}
        activeId={model.activeId}
        getMetaForEntry={model.getMetaForEntry}
        onRemove={model.onRemove}
      />
    </>
  );
}

export function WatchlistPage() {
  const model = useWatchlistPageModel();

  if (model.watchlistError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load watchlist. Please try again.</AlertDescription>
      </Alert>
    );
  }

  function renderBody() {
    if (model.loading) return <WatchlistSkeleton />;
    if (model.entries.length === 0) return <WatchlistEmptyState filter={model.filter} />;
    return <WatchlistContent model={model} />;
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Watchlist</h1>
        <WatchlistPlexSyncButton />
      </div>
      <WatchlistFilterTabs filter={model.filter} onFilterChange={model.setFilter} />
      {renderBody()}
    </div>
  );
}
