import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ShoppingItemRow } from './ShoppingItemRow.js';

import type { ListItemRow as ItemRow } from '../../detail/types.js';

/**
 * DnD wrapper around the shopping item list. Mirrors PRD-140's generic
 * `ListItemsSection` but renders `ShoppingItemRow` (the denser, swipe-aware
 * row) and respects `isDragDisabled` from `useShoppingSort` so the drag
 * gesture is suppressed when sort mode != Manual (PRD-141 §Edge Cases —
 * drag in a non-Manual sort would visibly snap back).
 */
export interface ShoppingItemsSectionProps {
  items: readonly ItemRow[];
  isDragDisabled: boolean;
  onToggleChecked: (id: number, currentlyChecked: boolean) => void;
  onSaveLabel: (id: number, label: string) => Promise<boolean>;
  onReorder: (orderedIds: readonly number[]) => Promise<boolean>;
  onDelete: (id: number) => void;
}

function useReorderSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
}

function useOrderedIds(items: readonly ItemRow[]) {
  const [orderedIds, setOrderedIds] = useState<number[]>(() => items.map((r) => r.id));
  useEffect(() => {
    setOrderedIds(items.map((r) => r.id));
  }, [items]);
  return [orderedIds, setOrderedIds] as const;
}

export function ShoppingItemsSection(props: ShoppingItemsSectionProps): React.ReactElement {
  const { t } = useTranslation('lists');
  const [orderedIds, setOrderedIds] = useOrderedIds(props.items);
  const sensors = useReorderSensors();

  const fireReorder = useCallback(
    async (next: number[]) => {
      const previous = orderedIds;
      setOrderedIds(next);
      const ok = await props.onReorder(next);
      if (!ok) setOrderedIds(previous);
    },
    [orderedIds, props, setOrderedIds]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (props.isDragDisabled) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = orderedIds.indexOf(Number(active.id));
      const newIndex = orderedIds.indexOf(Number(over.id));
      if (oldIndex !== -1 && newIndex !== -1) {
        void fireReorder(arrayMove(orderedIds, oldIndex, newIndex));
      }
    },
    [fireReorder, orderedIds, props.isDragDisabled]
  );

  const moveBy = useCallback(
    (id: number, delta: -1 | 1) => {
      const index = orderedIds.indexOf(id);
      if (index === -1) return;
      const target = index + delta;
      if (target >= 0 && target < orderedIds.length) {
        void fireReorder(arrayMove(orderedIds, index, target));
      }
    },
    [fireReorder, orderedIds]
  );

  if (props.items.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        {t('shopping.empty')}
      </p>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
        <RowList orderedIds={orderedIds} moveBy={moveBy} {...props} />
      </SortableContext>
    </DndContext>
  );
}

interface RowListProps extends ShoppingItemsSectionProps {
  orderedIds: number[];
  moveBy: (id: number, delta: -1 | 1) => void;
}

function RowList(props: RowListProps): React.ReactElement {
  const byId = new Map(props.items.map((r) => [r.id, r] as const));
  const rows = props.orderedIds
    .map((id) => byId.get(id))
    .filter((row): row is ItemRow => row != null);
  return (
    <ul className="space-y-2" data-testid="shopping-items">
      {rows.map((row, index) => (
        <ShoppingItemRow
          key={row.id}
          row={row}
          canMoveUp={index > 0}
          canMoveDown={index < rows.length - 1}
          isDragDisabled={props.isDragDisabled}
          onToggleChecked={props.onToggleChecked}
          onSaveLabel={props.onSaveLabel}
          onMoveUp={(id) => props.moveBy(id, -1)}
          onMoveDown={(id) => props.moveBy(id, 1)}
          onDelete={props.onDelete}
        />
      ))}
    </ul>
  );
}
