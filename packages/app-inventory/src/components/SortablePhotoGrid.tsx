/**
 * SortablePhotoGrid — Drag-and-drop reorderable photo thumbnail grid.
 *
 * Uses native HTML5 drag-and-drop. On drop, calls onReorder with the
 * new ordered array of photo IDs.
 */
import { GripVertical } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import type { PhotoItem } from './PhotoGallery';

interface SortablePhotoGridProps {
  photos: PhotoItem[];
  onReorder: (orderedIds: number[]) => void;
  baseUrl?: string;
  isReordering?: boolean;
}

export function SortablePhotoGrid({
  photos,
  onReorder,
  baseUrl = '/api/inventory/photos',
  isReordering = false,
}: SortablePhotoGridProps) {
  const sorted = [...photos].toSorted((a, b) => a.sortOrder - b.sortOrder);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  const photoSrc = (filePath: string) => `${baseUrl}/${encodeURIComponent(filePath)}`;

  const handleDragStart = useCallback((index: number) => {
    dragRef.current = index;
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      if (index !== overIndex) {
        setOverIndex(index);
      }
    },
    [overIndex]
  );

  const handleDrop = useCallback(
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
      reordered.splice(dropIndex, 0, moved!);

      onReorder(reordered.map((p) => p.id));
      setDragIndex(null);
      setOverIndex(null);
    },
    [sorted, onReorder]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setOverIndex(null);
    dragRef.current = null;
  }, []);

  if (photos.length <= 1) return null;

  return (
    <div
      className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2"
      role="list"
      aria-label="Reorder photos"
    >
      {sorted.map((photo, index) => (
        <div
          key={photo.id}
          role="listitem"
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDrop={(e) => handleDrop(e, index)}
          onDragEnd={handleDragEnd}
          className={`relative group cursor-grab active:cursor-grabbing rounded-md overflow-hidden border transition-all ${
            dragIndex === index ? 'opacity-40 scale-95' : ''
          } ${overIndex === index && dragIndex !== index ? 'ring-2 ring-app-accent' : ''} ${
            isReordering ? 'pointer-events-none opacity-60' : ''
          }`}
          aria-label={`Photo ${index + 1}: ${photo.caption ?? 'no caption'}`}
        >
          <div className="aspect-square">
            <img
              src={photoSrc(photo.filePath)}
              alt={photo.caption ?? `Photo ${index + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
              draggable={false}
            />
          </div>
          <div className="absolute top-1 left-1 p-0.5 rounded bg-background/70 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="h-3.5 w-3.5" />
          </div>
          {index === 0 && (
            <span className="absolute bottom-1 left-1 text-2xs font-bold bg-app-accent text-white px-1.5 py-0.5 rounded">
              Primary
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
