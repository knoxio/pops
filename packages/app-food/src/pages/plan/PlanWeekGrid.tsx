/**
 * PRD-143 — desktop week grid.
 *
 * 7-column × N-slot grid. Each cell hosts a sortable list of plan
 * entries. Drag across cells calls `moveEntry`; drag within a cell calls
 * `reorderSlot`. The mobile day-swiper variant lives in
 * `PlanDaySwiper.tsx`; `PlanPage` picks one or the other via
 * `useIsMobile`.
 */
import { DndContext } from '@dnd-kit/core';

import { formatDayLabel, isPastDate, weekDates } from './iso-week.js';
import { groupEntriesByCell } from './plan-grid-dnd.js';
import { PlanCell } from './PlanCell.js';
import { usePlanDndHandlers, usePlanDndSensors } from './usePlanDnd.js';

import type { ReactElement } from 'react';

import type { WirePlanEntryRow, WirePlanSlotRow } from './plan-wire-types.js';

export interface PlanWeekGridProps {
  weekStart: string;
  slots: readonly WirePlanSlotRow[];
  entries: readonly WirePlanEntryRow[];
  onEdit: (entryId: number) => void;
  onAdd: (date: string, slot: string) => void;
}

export function PlanWeekGrid(props: PlanWeekGridProps): ReactElement {
  const { weekStart, slots, entries, onEdit, onAdd } = props;
  const days = weekDates(weekStart);
  const byCell = groupEntriesByCell(entries);
  const sensors = usePlanDndSensors();
  const { onDragEnd } = usePlanDndHandlers(entries);
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
          <PlanCell
            key={key}
            date={date}
            slot={slot.slug}
            entries={entries}
            layout="grid"
            onEdit={onEdit}
            onAdd={onAdd}
          />
        );
      })}
    </tr>
  );
}
