import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItemMenu } from '../../detail/ListItemMenu.js';
import { ShoppingRowBody } from './ShoppingRowBody.js';
import { SwipeDeleteAction } from './SwipeDeleteAction.js';
import { useShoppingEdit } from './useShoppingEdit.js';
import { useSwipeDelete } from './useSwipeDelete.js';

import type { ListItemRow as ItemRow } from '../../detail/types.js';

/**
 * Shopping-tuned row (PRD-141 §ShoppingItemRow). 32×32px checkbox + 44×44
 * hit area, always-visible qty/unit prefix, notes-as-subline, touch
 * swipe-left to reveal an explicit Delete button, long-press drag handle
 * (disabled when sort mode != Manual).
 */
export interface ShoppingItemRowProps {
  row: ItemRow;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isDragDisabled: boolean;
  onToggleChecked: (id: number, currentlyChecked: boolean) => void;
  onSaveLabel: (id: number, label: string) => Promise<boolean>;
  onMoveUp: (id: number) => void;
  onMoveDown: (id: number) => void;
  onDelete: (id: number) => void;
}

export function ShoppingItemRow(props: ShoppingItemRowProps): React.ReactElement {
  const sortable = useSortable({ id: props.row.id, disabled: props.isDragDisabled });
  const swipe = useSwipeDelete();
  const edit = useShoppingEdit(props.row, props.onSaveLabel);
  const isChecked = props.row.checked === 1;
  const onLabelKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void edit.commit();
    } else if (e.key === 'Escape') edit.cancel();
  };
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
  return (
    <li
      ref={sortable.setNodeRef}
      style={style}
      data-testid={`shopping-item-${props.row.id}`}
      onTouchStart={swipe.onTouchStart}
      onTouchMove={swipe.onTouchMove}
      onTouchEnd={swipe.onTouchEnd}
      className={`relative flex min-h-11 items-center gap-3 rounded-md border bg-card p-2 ${
        sortable.isDragging ? 'opacity-60 shadow-lg' : ''
      }`}
    >
      <DragHandle sortable={sortable} disabled={props.isDragDisabled} />
      <Checkbox row={props.row} isChecked={isChecked} onToggleChecked={props.onToggleChecked} />
      <ShoppingRowBody row={props.row} isChecked={isChecked} edit={edit} onLabelKey={onLabelKey} />
      <RowTrailing
        canMoveUp={props.canMoveUp}
        canMoveDown={props.canMoveDown}
        swipeOpen={swipe.isOpen}
        onSwipeReset={swipe.reset}
        onEdit={edit.begin}
        onMoveUp={() => props.onMoveUp(props.row.id)}
        onMoveDown={() => props.onMoveDown(props.row.id)}
        onDelete={() => props.onDelete(props.row.id)}
      />
    </li>
  );
}

function DragHandle({
  sortable,
  disabled,
}: {
  sortable: ReturnType<typeof useSortable>;
  disabled: boolean;
}) {
  const { t } = useTranslation('lists');
  return (
    <button
      type="button"
      className={`flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground ${
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-grab'
      }`}
      aria-label={t('shopping.item.dragHandle')}
      title={disabled ? t('shopping.item.dragDisabled') : t('shopping.item.dragHandle')}
      disabled={disabled}
      {...sortable.attributes}
      {...sortable.listeners}
    >
      ⋮⋮
    </button>
  );
}

function Checkbox({
  row,
  isChecked,
  onToggleChecked,
}: {
  row: ItemRow;
  isChecked: boolean;
  onToggleChecked: (id: number, currentlyChecked: boolean) => void;
}) {
  const { t } = useTranslation('lists');
  return (
    <input
      type="checkbox"
      checked={isChecked}
      onChange={() => onToggleChecked(row.id, isChecked)}
      className="h-8 w-8 cursor-pointer"
      aria-label={t('shopping.item.checkbox', { label: row.label })}
    />
  );
}

function RowTrailing({
  canMoveUp,
  canMoveDown,
  swipeOpen,
  onSwipeReset,
  onEdit,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  swipeOpen: boolean;
  onSwipeReset: () => void;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  if (swipeOpen) {
    return (
      <SwipeDeleteAction
        onCancel={onSwipeReset}
        onDelete={() => {
          onSwipeReset();
          onDelete();
        }}
      />
    );
  }
  return (
    <ListItemMenu
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      onEdit={onEdit}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      onDelete={onDelete}
    />
  );
}
