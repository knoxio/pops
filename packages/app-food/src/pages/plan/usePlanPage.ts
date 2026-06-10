/**
 * PRD-143 data hook for the planning page.
 *
 * Wraps `food.plan.weekView` with 60s polling and exposes ergonomic
 * mutation helpers that invalidate the week query on success.
 */
import { useCallback } from 'react';

import { trpc } from '@pops/api-client';

import { toIsoMonday } from './iso-week.js';

const WEEK_POLL_INTERVAL_MS = 60_000;

export interface UsePlanPageOpts {
  weekParam: string | null;
  /** Pinned "today" for tests. */
  today?: Date;
}

export function usePlanPage({ weekParam, today }: UsePlanPageOpts) {
  const weekStart = toIsoMonday(weekParam ?? formatToday(today ?? new Date()));
  const utils = trpc.useUtils();
  const weekQuery = trpc.food.plan.weekView.useQuery(
    { weekStart },
    { refetchInterval: WEEK_POLL_INTERVAL_MS, refetchIntervalInBackground: false }
  );
  const slotsQuery = trpc.food.plan.listSlots.useQuery(undefined, {
    refetchInterval: WEEK_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const invalidate = useCallback(() => {
    void utils.food.plan.weekView.invalidate();
    void utils.food.plan.listSlots.invalidate();
  }, [utils]);

  const addEntry = trpc.food.plan.addEntry.useMutation({ onSuccess: invalidate });
  const updateEntry = trpc.food.plan.updateEntry.useMutation({ onSuccess: invalidate });
  const moveEntry = trpc.food.plan.moveEntry.useMutation({ onSuccess: invalidate });
  const reorderSlot = trpc.food.plan.reorderSlot.useMutation({ onSuccess: invalidate });
  const deleteEntry = trpc.food.plan.deleteEntry.useMutation({ onSuccess: invalidate });
  const addSlot = trpc.food.plan.addSlot.useMutation({ onSuccess: invalidate });
  const updateSlot = trpc.food.plan.updateSlot.useMutation({ onSuccess: invalidate });
  const deleteSlot = trpc.food.plan.deleteSlot.useMutation({ onSuccess: invalidate });

  return {
    weekStart,
    weekQuery,
    slotsQuery,
    mutations: {
      addEntry,
      updateEntry,
      moveEntry,
      reorderSlot,
      deleteEntry,
      addSlot,
      updateSlot,
      deleteSlot,
    },
  };
}

function formatToday(date: Date): string {
  const y = date.getFullYear().toString().padStart(4, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}
