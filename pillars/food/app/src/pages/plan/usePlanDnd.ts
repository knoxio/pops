/**
 * Shared drag-and-drop wiring for the planning surface: a single
 * `DragEndEvent` handler plus the sensor and mutation stack used by both
 * `PlanWeekGrid` (desktop) and `PlanDaySwiper` (mobile). Keeping it in one
 * place means a touch tap on the mobile swiper resolves the same way it does
 * on the desktop grid.
 *
 * Spec: pillars/food/docs/prds/planning-page
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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { unwrap } from '../../food-api-helpers.js';
import { planMoveEntry, planReorderSlot } from '../../food-api/index.js';
import { resolveGridDrop } from './plan-grid-dnd.js';

import type { PlanMoveEntryData, PlanReorderSlotData } from '../../food-api/types.gen.js';
import type { WirePlanEntryRow } from './plan-wire-types.js';

type PlanMoveEntryInput = NonNullable<PlanMoveEntryData['body']> & { id: number };
type PlanReorderSlotInput = NonNullable<PlanReorderSlotData['body']>;

export function usePlanDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
}

export function usePlanDndHandlers(entries: readonly WirePlanEntryRow[]) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['food', 'plan', 'weekView'] });
  const moveEntry = useMutation({
    mutationFn: async ({ id, ...body }: PlanMoveEntryInput) =>
      unwrap(await planMoveEntry({ path: { id }, body })),
    onSuccess: invalidate,
  });
  const reorderSlot = useMutation({
    mutationFn: async (input: PlanReorderSlotInput) =>
      unwrap(await planReorderSlot({ body: input })),
    onSuccess: invalidate,
  });
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
