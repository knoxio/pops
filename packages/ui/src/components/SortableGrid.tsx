/**
 * SortableGrid — HTML5 drag-drop reorder grid.
 *
 * Domain-agnostic reorder mechanics. Consumers provide a `renderItem`
 * callback and an `onReorder` handler that receives the new array.
 */
import { type ReactNode, useState } from 'react';

import { cn } from '../lib/utils';

export interface SortableGridProps<T> {
  items: T[];
  getKey: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number, state: { isDragging: boolean }) => ReactNode;
  onReorder: (nextOrder: T[]) => void;
  /** Tailwind grid classes. Default `grid-cols-3`. */
  columnsClassName?: string;
  /** Disable drag-drop. */
  disabled?: boolean;
  className?: string;
}

export function SortableGrid<T>({
  items,
  getKey,
  renderItem,
  onReorder,
  columnsClassName = 'grid-cols-3',
  disabled,
  className,
}: SortableGridProps<T>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const handleDragStart = (i: number) => (e: React.DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    setDragIndex(i);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (i: number) => (e: React.DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overIndex !== i) setOverIndex(i);
  };

  const handleDrop = (i: number) => (e: React.DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = items.slice();
    const [moved] = next.splice(dragIndex, 1);
    if (moved !== undefined) next.splice(i, 0, moved);
    onReorder(next);
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className={cn('grid gap-3', columnsClassName, className)}>
      {items.map((item, i) => {
        const isDragging = dragIndex === i;
        const isOver = overIndex === i && dragIndex !== i;
        return (
          <div
            key={getKey(item, i)}
            draggable={!disabled}
            onDragStart={handleDragStart(i)}
            onDragOver={handleDragOver(i)}
            onDrop={handleDrop(i)}
            onDragEnd={handleDragEnd}
            className={cn(
              'transition-all',
              isDragging && 'opacity-40',
              isOver && 'ring-2 ring-ring ring-offset-2'
            )}
          >
            {renderItem(item, i, { isDragging })}
          </div>
        );
      })}
    </div>
  );
}
