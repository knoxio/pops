import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  type SensorDescriptor,
  type SensorOptions,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

import { SortableWatchlistCard, WatchlistCard } from '../../components/WatchlistCard';

import type { WatchlistEntry } from './types';
import type { MediaMeta } from './types';

type WatchlistDesktopDndProps = {
  sensors: SensorDescriptor<SensorOptions>[];
  collisionDetection: CollisionDetection;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: () => void;
  sortedEntries: WatchlistEntry[];
  hasManyItems: boolean;
  removingId: number | null;
  activeId: number | null;
  getMetaForEntry: (entry: WatchlistEntry) => MediaMeta | undefined;
  onRemove: (id: number) => void;
};

export function WatchlistDesktopDnd({
  sensors,
  collisionDetection,
  onDragStart,
  onDragEnd,
  onDragCancel,
  sortedEntries,
  hasManyItems,
  removingId,
  activeId,
  getMetaForEntry,
  onRemove,
}: WatchlistDesktopDndProps) {
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <SortableContext
        items={sortedEntries.map((e) => e.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="hidden md:grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {sortedEntries.map((entry, index) => {
            const meta = getMetaForEntry(entry);
            const cardProps = {
              entry,
              title: meta?.title ?? 'Unknown',
              year: meta?.year ?? null,
              posterUrl: meta?.posterUrl ?? null,
              priority: index + 1,
              onRemove,
              isRemoving: removingId === entry.id,
              rotationStatus: entry.mediaType === 'movie' ? meta?.rotationStatus : undefined,
              rotationExpiresAt: entry.mediaType === 'movie' ? meta?.rotationExpiresAt : undefined,
            };

            return hasManyItems ? (
              <SortableWatchlistCard key={entry.id} {...cardProps} />
            ) : (
              <WatchlistCard key={entry.id} {...cardProps} />
            );
          })}
        </div>
      </SortableContext>

      <DragOverlay>{renderDragOverlay(sortedEntries, activeId, getMetaForEntry)}</DragOverlay>
    </DndContext>
  );
}

function renderDragOverlay(
  sortedEntries: WatchlistEntry[],
  activeId: number | null,
  getMetaForEntry: (entry: WatchlistEntry) => MediaMeta | undefined
) {
  if (activeId == null) return null;

  const entry = sortedEntries.find((e) => e.id === activeId);
  if (!entry) return null;

  const meta = getMetaForEntry(entry);
  const idx = sortedEntries.findIndex((e) => e.id === activeId);

  return (
    <div className="opacity-80 w-48">
      <WatchlistCard
        entry={entry}
        title={meta?.title ?? 'Unknown'}
        year={meta?.year ?? null}
        posterUrl={meta?.posterUrl ?? null}
        priority={idx + 1}
        onRemove={() => {}}
        isRemoving={false}
        rotationStatus={entry.mediaType === 'movie' ? meta?.rotationStatus : undefined}
        rotationExpiresAt={entry.mediaType === 'movie' ? meta?.rotationExpiresAt : undefined}
      />
    </div>
  );
}
