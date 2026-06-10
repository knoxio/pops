/**
 * PRD-143 — week grid view.
 *
 * 7-column × N-slot grid (default `breakfast / lunch / dinner / snack /
 * prep-session`). Each cell hosts a sortable list of plan entries. Drag
 * across cells calls `moveEntry`; drag within a cell calls
 * `reorderSlot`. The PRD calls for a separate mobile day swiper — at
 * narrow viewports the grid degrades to a stack-by-day list (tracked as
 * a follow-up GitHub issue).
 */
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import { trpc } from '@pops/api-client';
import { Button } from '@pops/ui';

import { formatDayLabel, isPastDate, weekDates } from './iso-week.js';
import { groupEntriesByCell, resolveGridDrop } from './plan-grid-dnd.js';
import { PlanEntryRow } from './PlanEntryRow.js';

import type { ReactElement } from 'react';

import type { WirePlanEntryRow, WirePlanSlotRow } from '@pops/app-food-db';

export interface PlanWeekGridProps {
  weekStart: string;
  slots: readonly WirePlanSlotRow[];
  entries: readonly WirePlanEntryRow[];
  onEdit: (entryId: number) => void;
  onAdd: (date: string, slot: string) => void;
}

function useGridDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
}

function useGridMutations() {
  const utils = trpc.useUtils();
  const invalidate = () => void utils.food.plan.weekView.invalidate();
  return {
    moveEntry: trpc.food.plan.moveEntry.useMutation({ onSuccess: invalidate }),
    reorderSlot: trpc.food.plan.reorderSlot.useMutation({ onSuccess: invalidate }),
  };
}

export function PlanWeekGrid(props: PlanWeekGridProps): ReactElement {
  const { weekStart, slots, entries, onEdit, onAdd } = props;
  const days = weekDates(weekStart);
  const byCell = groupEntriesByCell(entries);
  const sensors = useGridDndSensors();
  const { moveEntry, reorderSlot } = useGridMutations();
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const action = resolveGridDrop({ entries, activeId: Number(active.id), overId: over.id });
    if (action === null) return;
    if (action.kind === 'move') {
      moveEntry.mutate({ id: action.id, date: action.date, slot: action.slot });
    } else {
      reorderSlot.mutate({ date: action.date, slot: action.slot, orderedIds: action.orderedIds });
    }
  };
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <GridTable slots={slots} days={days} byCell={byCell} onEdit={onEdit} onAdd={onAdd} />
    </DndContext>
  );
}

interface GridTableProps {
  slots: readonly WirePlanSlotRow[];
  days: readonly string[];
  byCell: Map<string, readonly WirePlanEntryRow[]>;
  onEdit: (entryId: number) => void;
  onAdd: (date: string, slot: string) => void;
}

function GridTable({ slots, days, byCell, onEdit, onAdd }: GridTableProps): ReactElement {
  return (
    <div className="overflow-x-auto" data-testid="plan-week-grid">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-32 text-left p-2 align-bottom">Slot</th>
            {days.map((date, i) => (
              <th
                key={date}
                className={`text-left p-2 align-bottom ${isPastDate(date) ? 'text-muted-foreground' : ''}`}
                data-testid={`day-header-${date}`}
              >
                {formatDayLabel(date, i)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <SlotTableRow
              key={slot.slug}
              slot={slot}
              days={days}
              byCell={byCell}
              onEdit={onEdit}
              onAdd={onAdd}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SlotTableRowProps {
  slot: WirePlanSlotRow;
  days: readonly string[];
  byCell: Map<string, readonly WirePlanEntryRow[]>;
  onEdit: (entryId: number) => void;
  onAdd: (date: string, slot: string) => void;
}

function SlotTableRow({ slot, days, byCell, onEdit, onAdd }: SlotTableRowProps): ReactElement {
  return (
    <tr data-testid={`slot-row-${slot.slug}`}>
      <th className="text-left align-top p-2 font-medium">{slot.name}</th>
      {days.map((date) => {
        const key = `${date}::${slot.slug}`;
        const entries = byCell.get(key) ?? [];
        return (
          <Cell
            key={key}
            date={date}
            slot={slot.slug}
            entries={entries}
            onEdit={onEdit}
            onAdd={onAdd}
          />
        );
      })}
    </tr>
  );
}

interface CellProps {
  date: string;
  slot: string;
  entries: readonly WirePlanEntryRow[];
  onEdit: (entryId: number) => void;
  onAdd: (date: string, slot: string) => void;
}

function Cell({ date, slot, entries, onEdit, onAdd }: CellProps): ReactElement {
  const key = `${date}::${slot}`;
  const { setNodeRef, isOver } = useDroppable({ id: key });
  const allCooked = entries.length > 0 && entries.every((e) => e.recipeRunId !== null);
  const past = isPastDate(date);
  return (
    <td
      ref={setNodeRef}
      className={[
        'align-top p-1 border min-w-[120px]',
        past ? 'bg-muted/30' : '',
        allCooked ? 'bg-green-100/30' : '',
        isOver ? 'outline outline-2 outline-primary/40' : '',
      ].join(' ')}
      data-testid={`cell-${key}`}
    >
      <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {entries.map((e) => (
            <PlanEntryRow key={e.id} entry={e} onEdit={onEdit} />
          ))}
        </div>
      </SortableContext>
      <Button
        size="sm"
        variant="ghost"
        className="mt-1 w-full text-muted-foreground"
        onClick={() => onAdd(date, slot)}
        data-testid={`cell-add-${key}`}
        aria-label={`Add to ${slot} on ${date}`}
      >
        +
      </Button>
    </td>
  );
}
