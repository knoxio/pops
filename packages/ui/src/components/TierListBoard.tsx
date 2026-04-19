/**
 * TierListBoard — drag-drop tier-list ranking board.
 *
 * Generic over item data. Uses HTML5 drag-and-drop (no external dnd
 * library required). Tiers are ordered rows; unranked items sit in a
 * pool at the bottom and a "dismiss" zone optionally removes items.
 */
import { X } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { cn } from '../lib/utils';

export interface TierDefinition {
  id: string;
  label: string;
  /** Accent colour for the tier row. */
  color?: string;
}

export interface TierListBoardProps<T> {
  tiers: TierDefinition[];
  /** Current assignment of items to tiers. `null` = unranked pool. */
  assignments: Record<string, string[]>;
  /** All items, keyed by id used inside `assignments`. */
  items: Record<string, T>;
  renderItem: (item: T, id: string) => ReactNode;
  onAssignmentsChange: (next: Record<string, string[]>) => void;
  /** Enable the "dismiss" drop zone. Default false. */
  showDismissZone?: boolean;
  onDismiss?: (id: string) => void;
  unrankedLabel?: ReactNode;
  className?: string;
}

const POOL = '__pool';
const DISMISS = '__dismiss';

export function TierListBoard<T>({
  tiers,
  assignments,
  items,
  renderItem,
  onAssignmentsChange,
  showDismissZone = false,
  onDismiss,
  unrankedLabel = 'Unranked',
  className,
}: TierListBoardProps<T>) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overZone, setOverZone] = useState<string | null>(null);

  const rows = [
    ...tiers.map((t) => ({ id: t.id, label: t.label, color: t.color })),
    { id: POOL, label: unrankedLabel, color: undefined },
  ];

  const handleDrop = (zone: string) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOverZone(null);
    if (!dragId) return;
    if (zone === DISMISS) {
      const next: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(assignments)) next[k] = v.filter((id) => id !== dragId);
      onAssignmentsChange(next);
      onDismiss?.(dragId);
      setDragId(null);
      return;
    }
    const next: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(assignments)) next[k] = v.filter((id) => id !== dragId);
    const current = next[zone] ?? [];
    next[zone] = [...current, dragId];
    onAssignmentsChange(next);
    setDragId(null);
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {rows.map((row) => {
        const zoneItems = assignments[row.id] ?? [];
        const isOver = overZone === row.id;
        return (
          <div
            key={row.id}
            onDragOver={(e) => {
              e.preventDefault();
              if (overZone !== row.id) setOverZone(row.id);
            }}
            onDragLeave={() => setOverZone((z) => (z === row.id ? null : z))}
            onDrop={handleDrop(row.id)}
            className={cn(
              'flex min-h-[72px] items-stretch gap-3 rounded-md border border-border bg-card p-2 transition-colors',
              isOver && 'ring-2 ring-ring',
              row.id === POOL && 'bg-muted/40'
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
                  <div
                    key={id}
                    draggable
                    onDragStart={() => setDragId(id)}
                    onDragEnd={() => setDragId(null)}
                    className={cn(
                      'cursor-grab active:cursor-grabbing transition-opacity',
                      dragId === id && 'opacity-40'
                    )}
                  >
                    {renderItem(item, id)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {showDismissZone ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (overZone !== DISMISS) setOverZone(DISMISS);
          }}
          onDragLeave={() => setOverZone((z) => (z === DISMISS ? null : z))}
          onDrop={handleDrop(DISMISS)}
          className={cn(
            'flex min-h-[56px] items-center justify-center gap-2 rounded-md border-2 border-dashed border-destructive/40 p-2 text-sm text-destructive transition-colors',
            overZone === DISMISS && 'bg-destructive/10'
          )}
        >
          <X className="h-4 w-4" aria-hidden /> Drop here to remove
        </div>
      ) : null}
    </div>
  );
}
