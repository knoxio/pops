/**
 * SortablePhotoGrid — Drag-and-drop reorderable photo thumbnail grid.
 *
 * Uses native HTML5 drag-and-drop. On drop, calls onReorder with the
 * new ordered array of photo IDs. When onDelete is provided, each photo
 * shows a delete button on hover.
 */
import { GripVertical, Trash2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import type { PhotoItem } from './PhotoGallery';

interface SortablePhotoGridProps {
  photos: PhotoItem[];
  onReorder: (orderedIds: number[]) => void;
  onDelete?: (photoId: number) => void;
  baseUrl?: string;
  isReordering?: boolean;
}

interface DragHandlers {
  onStart: (index: number) => void;
  onOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onEnd: () => void;
}

interface PhotoCellProps {
  photo: PhotoItem;
  index: number;
  src: string;
  canReorder: boolean;
  isReordering: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onDelete?: (photoId: number) => void;
  handlers: DragHandlers;
}

function buildCellClassName(
  canReorder: boolean,
  isDragging: boolean,
  isDropTarget: boolean,
  isReordering: boolean
): string {
  const classes = ['relative group rounded-md overflow-hidden border transition-all'];
  if (canReorder) classes.push('cursor-grab active:cursor-grabbing');
  if (isDragging) classes.push('opacity-40 scale-95');
  if (isDropTarget) classes.push('ring-2 ring-app-accent');
  if (isReordering) classes.push('pointer-events-none opacity-60');
  return classes.join(' ');
}

function PhotoCell({
  photo,
  index,
  src,
  canReorder,
  isReordering,
  isDragging,
  isDropTarget,
  onDelete,
  handlers,
}: PhotoCellProps) {
  return (
    <div
      role="listitem"
      draggable={canReorder}
      onDragStart={canReorder ? () => handlers.onStart(index) : undefined}
      onDragOver={canReorder ? (e) => handlers.onOver(e, index) : undefined}
      onDrop={canReorder ? (e) => handlers.onDrop(e, index) : undefined}
      onDragEnd={canReorder ? handlers.onEnd : undefined}
      className={buildCellClassName(canReorder, isDragging, isDropTarget, isReordering)}
      aria-label={`Photo ${index + 1}: ${photo.caption ?? 'no caption'}`}
    >
      <div className="aspect-square">
        <img
          src={src}
          alt={photo.caption ?? `Photo ${index + 1}`}
          className="w-full h-full object-cover"
          loading="lazy"
          draggable={false}
        />
      </div>
      {canReorder && (
        <div className="absolute top-1 left-1 p-0.5 rounded bg-background/70 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="h-3.5 w-3.5" />
        </div>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(photo.id)}
          className="absolute top-1 right-1 h-6 w-6 flex items-center justify-center rounded-full bg-background/80 text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
          aria-label={`Delete photo ${photo.caption ?? photo.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      {index === 0 && (
        <span className="absolute bottom-1 left-1 text-2xs font-bold bg-app-accent text-white px-1.5 py-0.5 rounded">
          Primary
        </span>
      )}
    </div>
  );
}

function useDragHandlers(
  sorted: PhotoItem[],
  onReorder: (ids: number[]) => void
): {
  dragIndex: number | null;
  overIndex: number | null;
  handlers: DragHandlers;
} {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  const onStart = useCallback((index: number) => {
    dragRef.current = index;
    setDragIndex(index);
  }, []);

  const onOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      if (index !== overIndex) setOverIndex(index);
    },
    [overIndex]
  );

  const onDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      const fromIndex = dragRef.current;
      if (fromIndex === null || fromIndex === dropIndex) {
        setDragIndex(null);
        setOverIndex(null);
        return;
      }
      const reordered = [...sorted];
      const [moved] = reordered.splice(fromIndex, 1);
      if (!moved) return;
      reordered.splice(dropIndex, 0, moved);
      onReorder(reordered.map((p) => p.id));
      setDragIndex(null);
      setOverIndex(null);
    },
    [sorted, onReorder]
  );

  const onEnd = useCallback(() => {
    setDragIndex(null);
    setOverIndex(null);
    dragRef.current = null;
  }, []);

  return { dragIndex, overIndex, handlers: { onStart, onOver, onDrop, onEnd } };
}

export function SortablePhotoGrid({
  photos,
  onReorder,
  onDelete,
  baseUrl = '/api/inventory/photos',
  isReordering = false,
}: SortablePhotoGridProps) {
  const sorted = [...photos].toSorted((a, b) => a.sortOrder - b.sortOrder);
  const { dragIndex, overIndex, handlers } = useDragHandlers(sorted, onReorder);

  if (photos.length === 0) return null;
  const canReorder = photos.length > 1;

  return (
    <div
      className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2"
      role="list"
      aria-label="Reorder photos"
    >
      {sorted.map((photo, index) => (
        <PhotoCell
          key={photo.id}
          photo={photo}
          index={index}
          src={`${baseUrl}/${photo.filePath.split('/').map(encodeURIComponent).join('/')}`}
          canReorder={canReorder}
          isReordering={isReordering}
          isDragging={dragIndex === index}
          isDropTarget={overIndex === index && dragIndex !== index}
          onDelete={onDelete}
          handlers={handlers}
        />
      ))}
    </div>
  );
}
