/**
 * Drag-end resolver for the planning grid — pulled out of
 * `PlanWeekGrid.tsx` so the grid component stays under the per-function
 * line cap. Operates on a snapshot of entries + the active/over drag
 * payload and returns the mutation the grid should fire.
 */
import type { WirePlanEntryRow } from './plan-wire-types.js';

export type GridDndAction =
  | { kind: 'move'; id: number; date: string; slot: string }
  | { kind: 'reorder'; date: string; slot: string; orderedIds: number[] }
  | null;

interface ResolveOpts {
  entries: readonly WirePlanEntryRow[];
  activeId: number;
  overId: string | number;
}

export function resolveGridDrop({ entries, activeId, overId }: ResolveOpts): GridDndAction {
  const entry = entries.find((e) => e.id === activeId);
  if (!entry) return null;
  if (typeof overId === 'string' && overId.includes('::')) {
    return resolveDropOnCell(entry, activeId, overId);
  }
  const overEntry = entries.find((e) => e.id === Number(overId));
  if (!overEntry) return null;
  if (overEntry.date === entry.date && overEntry.slot === entry.slot) {
    return reorderWithin(entries, entry, activeId, overEntry.id);
  }
  return { kind: 'move', id: activeId, date: overEntry.date, slot: overEntry.slot };
}

function resolveDropOnCell(
  entry: WirePlanEntryRow,
  activeId: number,
  overId: string
): GridDndAction {
  const [date = '', slot = ''] = overId.split('::');
  if (date === entry.date && slot === entry.slot) return null;
  return { kind: 'move', id: activeId, date, slot };
}

function reorderWithin(
  entries: readonly WirePlanEntryRow[],
  entry: WirePlanEntryRow,
  activeId: number,
  overId: number
): GridDndAction {
  const cell = entries.filter((e) => e.date === entry.date && e.slot === entry.slot);
  const orderedIds = cell.map((e) => e.id);
  const oldIndex = orderedIds.indexOf(activeId);
  const newIndex = orderedIds.indexOf(overId);
  if (oldIndex === -1 || newIndex === -1) return null;
  const next = [...orderedIds];
  next.splice(oldIndex, 1);
  next.splice(newIndex, 0, activeId);
  return { kind: 'reorder', date: entry.date, slot: entry.slot, orderedIds: next };
}

export function groupEntriesByCell(
  entries: readonly WirePlanEntryRow[]
): Map<string, readonly WirePlanEntryRow[]> {
  const map = new Map<string, WirePlanEntryRow[]>();
  for (const e of entries) {
    const key = `${e.date}::${e.slot}`;
    const bucket = map.get(key) ?? [];
    bucket.push(e);
    map.set(key, bucket);
  }
  return map;
}
