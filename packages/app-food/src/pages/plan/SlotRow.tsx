/**
 * One row inside the slot-management drawer. Renders the slot name
 * (editable for custom slots), reorder up/down buttons, and a delete
 * affordance — defaults are locked per PRD-143 / PRD-111 invariants.
 */
import { useState, type ReactElement } from 'react';

import { Button } from '@pops/ui';

import type { WirePlanSlotRow } from './plan-wire-types.js';

export interface SlotRowProps {
  slot: WirePlanSlotRow;
  onRename: (name: string) => void;
  onReorder: (displayOrder: number) => void;
  onDelete: () => void;
}

export function SlotRow({ slot, onRename, onReorder, onDelete }: SlotRowProps): ReactElement {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(slot.name);
  return (
    <li
      className="flex items-center gap-2 border rounded px-2 py-1"
      data-testid={`slot-row-${slot.slug}`}
    >
      <span className="text-xs text-muted-foreground w-10">{slot.displayOrder}</span>
      <SlotNameCell
        slot={slot}
        editing={editing}
        name={name}
        setName={setName}
        onCommit={() => {
          setEditing(false);
          const trimmed = name.trim();
          if (trimmed === '') {
            setName(slot.name);
            return;
          }
          if (trimmed !== slot.name) onRename(trimmed);
        }}
      />
      <SlotActions slot={slot} onEdit={() => setEditing(true)} onDelete={onDelete} />
      <ReorderButtons slot={slot} onReorder={onReorder} />
    </li>
  );
}

function SlotNameCell(props: {
  slot: WirePlanSlotRow;
  editing: boolean;
  name: string;
  setName: (n: string) => void;
  onCommit: () => void;
}): ReactElement {
  if (props.editing) {
    return (
      <input
        className="flex-1 border rounded px-1 text-sm"
        value={props.name}
        onChange={(e) => props.setName(e.target.value)}
        onBlur={props.onCommit}
        autoFocus
        data-testid={`slot-rename-${props.slot.slug}`}
      />
    );
  }
  return <span className="flex-1 text-sm">{props.slot.name}</span>;
}

function SlotActions(props: {
  slot: WirePlanSlotRow;
  onEdit: () => void;
  onDelete: () => void;
}): ReactElement {
  if (props.slot.isDefault) {
    return (
      <span
        className="text-xs text-muted-foreground"
        data-testid={`slot-default-${props.slot.slug}`}
      >
        default
      </span>
    );
  }
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={props.onEdit}
        data-testid={`slot-rename-btn-${props.slot.slug}`}
      >
        Rename
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={props.onDelete}
        data-testid={`slot-delete-${props.slot.slug}`}
      >
        Delete
      </Button>
    </>
  );
}

function ReorderButtons(props: {
  slot: WirePlanSlotRow;
  onReorder: (displayOrder: number) => void;
}): ReactElement {
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => props.onReorder(Math.max(0, props.slot.displayOrder - 10))}
        data-testid={`slot-up-${props.slot.slug}`}
        aria-label={`Move ${props.slot.name} up`}
      >
        ↑
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => props.onReorder(props.slot.displayOrder + 10)}
        data-testid={`slot-down-${props.slot.slug}`}
        aria-label={`Move ${props.slot.name} down`}
      >
        ↓
      </Button>
    </>
  );
}
