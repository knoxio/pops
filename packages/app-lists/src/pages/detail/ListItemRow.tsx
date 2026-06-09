import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItemMenu } from './ListItemMenu.js';

import type { ListItemRow as ItemRow } from './types.js';

/**
 * Single row in the generic item list. Renders the checkbox, label (or
 * inline editor when clicked), optional qty/unit + sub-line, and the
 * three-dot menu.
 *
 * Drag-to-reorder is wired via `@dnd-kit/sortable` — the row's grip handle
 * carries the listener attributes so clicking the label / checkbox doesn't
 * start a drag.
 */
export interface ListItemRowProps {
  row: ItemRow;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggleChecked: (id: number, currentlyChecked: boolean) => void;
  onSaveLabel: (id: number, label: string) => Promise<boolean>;
  onMoveUp: (id: number) => void;
  onMoveDown: (id: number) => void;
  onDelete: (id: number) => void;
}

interface InlineEditState {
  editing: boolean;
  draft: string;
  begin: () => void;
  cancel: () => void;
  commit: () => Promise<void>;
  setDraft: (value: string) => void;
}

function useInlineEdit(
  row: ItemRow,
  onSaveLabel: (id: number, label: string) => Promise<boolean>
): InlineEditState {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.label);

  const begin = () => {
    setDraft(row.label);
    setEditing(true);
  };
  const cancel = () => setEditing(false);
  const commit = async () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || trimmed === row.label) {
      setEditing(false);
      return;
    }
    const ok = await onSaveLabel(row.id, trimmed);
    if (ok) setEditing(false);
  };

  return { editing, draft, begin, cancel, commit, setDraft };
}

export function ListItemRow(props: ListItemRowProps): React.ReactElement {
  const { t } = useTranslation('lists');
  const sortable = useSortable({ id: props.row.id });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
  const isChecked = props.row.checked === 1;
  const edit = useInlineEdit(props.row, props.onSaveLabel);

  return (
    <li
      ref={sortable.setNodeRef}
      style={style}
      data-testid={`list-item-${props.row.id}`}
      className={`flex items-start gap-2 rounded-md border bg-card p-2 ${
        sortable.isDragging ? 'opacity-60 shadow-lg' : ''
      }`}
    >
      <button
        type="button"
        className="mt-1 cursor-grab text-muted-foreground hover:text-foreground"
        aria-label={t('detail.item.dragHandle')}
        {...sortable.attributes}
        {...sortable.listeners}
      >
        ⋮⋮
      </button>
      <input
        type="checkbox"
        checked={isChecked}
        onChange={() => props.onToggleChecked(props.row.id, isChecked)}
        className="mt-1 h-4 w-4 cursor-pointer"
        aria-label={t('detail.item.checkbox', { label: props.row.label })}
      />
      <RowBody row={props.row} isChecked={isChecked} edit={edit} />
      <ListItemMenu
        canMoveUp={props.canMoveUp}
        canMoveDown={props.canMoveDown}
        onEdit={edit.begin}
        onMoveUp={() => props.onMoveUp(props.row.id)}
        onMoveDown={() => props.onMoveDown(props.row.id)}
        onDelete={() => props.onDelete(props.row.id)}
      />
    </li>
  );
}

function RowBody({
  row,
  isChecked,
  edit,
}: {
  row: ItemRow;
  isChecked: boolean;
  edit: InlineEditState;
}) {
  const { t } = useTranslation('lists');
  const onLabelKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void edit.commit();
    } else if (e.key === 'Escape') {
      edit.cancel();
    }
  };
  const labelText = formatLabel(row, t);
  const subline = formatSubline(row, t);

  return (
    <div className="min-w-0 flex-1">
      {edit.editing ? (
        <input
          type="text"
          value={edit.draft}
          onChange={(e) => edit.setDraft(e.target.value)}
          onBlur={() => void edit.commit()}
          onKeyDown={onLabelKey}
          className="w-full rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label={t('detail.item.editLabel')}
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={edit.begin}
          className={`block w-full text-left text-sm ${
            isChecked ? 'text-muted-foreground line-through' : ''
          }`}
        >
          {labelText}
        </button>
      )}
      {subline !== null ? (
        <p className="truncate text-xs text-muted-foreground" title={subline}>
          {subline}
        </p>
      ) : null}
    </div>
  );
}

function formatLabel(row: ItemRow, t: (key: string, opts?: Record<string, unknown>) => string) {
  const qtyPart = qtyUnitPrefix(row);
  return `${qtyPart}${row.label}` || t('detail.item.unnamed');
}

function qtyUnitPrefix(row: ItemRow): string {
  if (row.qty === null) return '';
  const qtyStr = formatQty(row.qty);
  if (row.unit === null) return `${qtyStr} `;
  return `${qtyStr}${row.unit} `;
}

function formatQty(qty: number) {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, '');
}

function formatSubline(row: ItemRow, t: (key: string) => string) {
  const noteSummary = row.notes !== null && row.notes.length > 0 ? truncate(row.notes, 80) : null;
  if (row.refKind !== 'free') {
    const refLabel = t(`detail.item.ref.${row.refKind}`);
    return noteSummary !== null ? `${refLabel} · ${noteSummary}` : refLabel;
  }
  return noteSummary;
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
