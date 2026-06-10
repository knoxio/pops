/**
 * PRD-143 — shared drag-and-drop wiring for the planning surface.
 *
 * Exposes a single `DragEndEvent` handler plus the sensor + mutation
 * stack used by both `PlanWeekGrid` (desktop) and `PlanDaySwiper`
 * (mobile). Keeping it in one place means a touch tap on the mobile
 * swiper resolves the same way it does on the desktop grid.
 */
import {
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useCallback } from 'react';

import { trpc } from '@pops/api-client';

import { resolveGridDrop } from './plan-grid-dnd.js';

import type { WirePlanEntryRow } from '@pops/app-food-db';

export function usePlanDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
}

export function usePlanDndHandlers(entries: readonly WirePlanEntryRow[]) {
  const utils = trpc.useUtils();
  const invalidate = () => void utils.food.plan.weekView.invalidate();
  const moveEntry = trpc.food.plan.moveEntry.useMutation({ onSuccess: invalidate });
  const reorderSlot = trpc.food.plan.reorderSlot.useMutation({ onSuccess: invalidate });
  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const action = resolveGridDrop({ entries, activeId: Number(active.id), overId: over.id });
      if (action === null) return;
      if (action.kind === 'move') {
        moveEntry.mutate({ id: action.id, date: action.date, slot: action.slot });
      } else {
        reorderSlot.mutate({ date: action.date, slot: action.slot, orderedIds: action.orderedIds });
      }
    },
    [entries, moveEntry, reorderSlot]
  );
  return { onDragEnd };
}
