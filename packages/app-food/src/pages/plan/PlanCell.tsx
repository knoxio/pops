/**
 * PRD-143 — one `(date, slot)` cell. Hosts the droppable target + the
 * sortable list of plan entries inside that cell + the `[+]` Add button.
 * Shared between the desktop week grid and the mobile day swiper so
 * drag-and-drop behaviour stays identical across viewports.
 */
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

import { Button } from '@pops/ui';

import { isPastDate } from './iso-week.js';
import { PlanEntryRow } from './PlanEntryRow.js';

import type { ReactElement } from 'react';

import type { WirePlanEntryRow } from './plan-wire-types.js';

export type PlanCellLayout = 'grid' | 'stacked';

export interface PlanCellProps {
  date: string;
  slot: string;
  entries: readonly WirePlanEntryRow[];
  layout: PlanCellLayout;
  onEdit: (entryId: number) => void;
  onAdd: (date: string, slot: string) => void;
}

export function PlanCell(props: PlanCellProps): ReactElement {
  const { date, slot, entries, layout, onEdit, onAdd } = props;
  const key = `${date}::${slot}`;
  const { setNodeRef, isOver } = useDroppable({ id: key });
  const allCooked = entries.length > 0 && entries.every((e) => e.recipeRunId !== null);
  const className = cellClassName({ layout, past: isPastDate(date), allCooked, isOver });
  const inner = (
    <CellContents
      date={date}
      slot={slot}
      entries={entries}
      onEdit={onEdit}
      onAdd={onAdd}
      cellKey={key}
    />
  );
  if (layout === 'grid') {
    return (
      <td ref={setNodeRef} className={className} data-testid={`cell-${key}`}>
        {inner}
      </td>
    );
  }
  return (
    <section ref={setNodeRef} className={className} data-testid={`cell-${key}`}>
      {inner}
    </section>
  );
}

interface CellClassNameArgs {
  layout: PlanCellLayout;
  past: boolean;
  allCooked: boolean;
  isOver: boolean;
}

function cellClassName({ layout, past, allCooked, isOver }: CellClassNameArgs): string {
  const base =
    layout === 'grid' ? 'align-top p-1 border min-w-[120px]' : 'rounded border p-2 space-y-1';
  return [
    base,
    past ? 'bg-muted/30' : '',
    allCooked ? 'bg-green-100/30' : '',
    isOver ? 'outline outline-2 outline-primary/40' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

interface CellContentsProps {
  date: string;
  slot: string;
  entries: readonly WirePlanEntryRow[];
  onEdit: (entryId: number) => void;
  onAdd: (date: string, slot: string) => void;
  cellKey: string;
}

function CellContents({
  date,
  slot,
  entries,
  onEdit,
  onAdd,
  cellKey,
}: CellContentsProps): ReactElement {
  return (
    <>
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
        data-testid={`cell-add-${cellKey}`}
        aria-label={`Add to ${slot} on ${date}`}
      >
        +
      </Button>
    </>
  );
}
