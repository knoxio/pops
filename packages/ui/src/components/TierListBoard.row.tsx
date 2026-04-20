import { type ReactNode } from 'react';

import { cn } from '../lib/utils';

export const UNRANKED_POOL_KEY = '__pool';

interface TierItemProps<T> {
  id: string;
  item: T;
  dragId: string | null;
  setDragId: (v: string | null) => void;
  renderItem: (item: T, id: string) => ReactNode;
}

export function TierItem<T>({ id, item, dragId, setDragId, renderItem }: TierItemProps<T>) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
        setDragId(id);
      }}
      onDragEnd={() => setDragId(null)}
      className={cn(
        'cursor-grab active:cursor-grabbing transition-opacity',
        dragId === id && 'opacity-40'
      )}
    >
      {renderItem(item, id)}
    </div>
  );
}

export interface TierRowProps<T> {
  row: { id: string; label: ReactNode; color?: string };
  zoneItems: string[];
  items: Record<string, T>;
  isOver: boolean;
  setOverZone: React.Dispatch<React.SetStateAction<string | null>>;
  onDrop: (zone: string) => (e: React.DragEvent<HTMLDivElement>) => void;
  dragId: string | null;
  setDragId: (v: string | null) => void;
  renderItem: (item: T, id: string) => ReactNode;
}

export function TierRow<T>({
  row,
  zoneItems,
  items,
  isOver,
  setOverZone,
  onDrop,
  dragId,
  setDragId,
  renderItem,
}: TierRowProps<T>) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!isOver) setOverZone(row.id);
      }}
      onDragLeave={() => setOverZone((z) => (z === row.id ? null : z))}
      onDrop={onDrop(row.id)}
      className={cn(
        'flex min-h-[72px] items-stretch gap-3 rounded-md border border-border bg-card p-2 transition-colors',
        isOver && 'ring-2 ring-ring',
        row.id === UNRANKED_POOL_KEY && 'bg-muted/40'
      )}
    >
      <div
        className="flex w-20 shrink-0 items-center justify-center rounded-sm px-2 text-sm font-semibold text-white"
        style={{ background: row.color ?? 'var(--muted)' }}
      >
        {row.label}
      </div>
      <div className="flex flex-wrap gap-2">
        {zoneItems.map((id) => {
          const item = items[id];
          if (!item) return null;
          return (
            <TierItem
              key={id}
              id={id}
              item={item}
              dragId={dragId}
              setDragId={setDragId}
              renderItem={renderItem}
            />
          );
        })}
      </div>
    </div>
  );
}
