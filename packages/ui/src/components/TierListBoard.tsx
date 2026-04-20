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
import { TierRow, UNRANKED_POOL_KEY } from './TierListBoard.row';

export { UNRANKED_POOL_KEY } from './TierListBoard.row';

const POOL = UNRANKED_POOL_KEY;
const DISMISS = '__dismiss';

export interface TierDefinition {
  id: string;
  label: string;
  /** Accent colour for the tier row. */
  color?: string;
}

export interface TierListBoardProps<T> {
  tiers: TierDefinition[];
  /**
   * Current assignment of items to tiers. Keyed by tier id; the reserved
   * `__pool` key holds unranked items that render in the bottom pool row.
   */
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

interface UseTierDropArgs {
  assignments: Record<string, string[]>;
  onAssignmentsChange: (n: Record<string, string[]>) => void;
  onDismiss?: (id: string) => void;
  dragId: string | null;
  setDragId: (v: string | null) => void;
  setOverZone: (v: string | null) => void;
}

function useTierDrop({
  assignments,
  onAssignmentsChange,
  onDismiss,
  dragId,
  setDragId,
  setOverZone,
}: UseTierDropArgs) {
  return (zone: string) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOverZone(null);
    if (!dragId) return;
    const next: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(assignments)) next[k] = v.filter((id) => id !== dragId);
    if (zone === DISMISS) {
      onAssignmentsChange(next);
      onDismiss?.(dragId);
      setDragId(null);
      return;
    }
    next[zone] = [...(next[zone] ?? []), dragId];
    onAssignmentsChange(next);
    setDragId(null);
  };
}

function DismissZone({
  active,
  setOverZone,
  onDrop,
}: {
  active: boolean;
  setOverZone: React.Dispatch<React.SetStateAction<string | null>>;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!active) setOverZone(DISMISS);
      }}
      onDragLeave={() => setOverZone((z) => (z === DISMISS ? null : z))}
      onDrop={onDrop}
      className={cn(
        'flex min-h-[56px] items-center justify-center gap-2 rounded-md border-2 border-dashed border-destructive/40 p-2 text-sm text-destructive transition-colors',
        active && 'bg-destructive/10'
      )}
    >
      <X className="h-4 w-4" aria-hidden /> Drop here to remove
    </div>
  );
}

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
    ...tiers.map((t) => ({ id: t.id, label: t.label as ReactNode, color: t.color })),
    { id: POOL, label: unrankedLabel, color: undefined },
  ];

  const handleDrop = useTierDrop({
    assignments,
    onAssignmentsChange,
    onDismiss,
    dragId,
    setDragId,
    setOverZone,
  });

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {rows.map((row) => (
        <TierRow
          key={row.id}
          row={row}
          zoneItems={assignments[row.id] ?? []}
          items={items}
          isOver={overZone === row.id}
          setOverZone={setOverZone}
          onDrop={handleDrop}
          dragId={dragId}
          setDragId={setDragId}
          renderItem={renderItem}
        />
      ))}
      {showDismissZone ? (
        <DismissZone
          active={overZone === DISMISS}
          setOverZone={setOverZone}
          onDrop={handleDrop(DISMISS)}
        />
      ) : null}
    </div>
  );
}
