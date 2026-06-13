/**
 * PRD-143 data hook for the planning page.
 *
 * Wraps `food.plan.weekView` with 60s polling and exposes ergonomic
 * mutation helpers that invalidate the week query on success.
 */
import { useCallback } from 'react';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

import { BadClientDateError, toIsoMonday } from './iso-week.js';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';

type PlanWeekViewOutput = inferRouterOutputs<AppRouter>['food']['plan']['weekView'];
type PlanListSlotsOutput = inferRouterOutputs<AppRouter>['food']['plan']['listSlots'];
type PlanAddEntryInput = inferRouterInputs<AppRouter>['food']['plan']['addEntry'];
type PlanAddEntryOutput = inferRouterOutputs<AppRouter>['food']['plan']['addEntry'];
type PlanUpdateEntryInput = inferRouterInputs<AppRouter>['food']['plan']['updateEntry'];
type PlanUpdateEntryOutput = inferRouterOutputs<AppRouter>['food']['plan']['updateEntry'];
type PlanMoveEntryInput = inferRouterInputs<AppRouter>['food']['plan']['moveEntry'];
type PlanMoveEntryOutput = inferRouterOutputs<AppRouter>['food']['plan']['moveEntry'];
type PlanReorderSlotInput = inferRouterInputs<AppRouter>['food']['plan']['reorderSlot'];
type PlanReorderSlotOutput = inferRouterOutputs<AppRouter>['food']['plan']['reorderSlot'];
type PlanDeleteEntryInput = inferRouterInputs<AppRouter>['food']['plan']['deleteEntry'];
type PlanDeleteEntryOutput = inferRouterOutputs<AppRouter>['food']['plan']['deleteEntry'];
type PlanAddSlotInput = inferRouterInputs<AppRouter>['food']['plan']['addSlot'];
type PlanAddSlotOutput = inferRouterOutputs<AppRouter>['food']['plan']['addSlot'];
type PlanUpdateSlotInput = inferRouterInputs<AppRouter>['food']['plan']['updateSlot'];
type PlanUpdateSlotOutput = inferRouterOutputs<AppRouter>['food']['plan']['updateSlot'];
type PlanDeleteSlotInput = inferRouterInputs<AppRouter>['food']['plan']['deleteSlot'];
type PlanDeleteSlotOutput = inferRouterOutputs<AppRouter>['food']['plan']['deleteSlot'];

const WEEK_POLL_INTERVAL_MS = 60_000;

export interface UsePlanPageOpts {
  weekParam: string | null;
  /** Pinned "today" for tests. */
  today?: Date;
}

function usePlanMutations(invalidate: () => void) {
  const addEntry = usePillarMutation<PlanAddEntryInput, PlanAddEntryOutput>(
    'food',
    ['plan', 'addEntry'],
    { onSuccess: invalidate }
  );
  const updateEntry = usePillarMutation<PlanUpdateEntryInput, PlanUpdateEntryOutput>(
    'food',
    ['plan', 'updateEntry'],
    { onSuccess: invalidate }
  );
  const moveEntry = usePillarMutation<PlanMoveEntryInput, PlanMoveEntryOutput>(
    'food',
    ['plan', 'moveEntry'],
    { onSuccess: invalidate }
  );
  const reorderSlot = usePillarMutation<PlanReorderSlotInput, PlanReorderSlotOutput>(
    'food',
    ['plan', 'reorderSlot'],
    { onSuccess: invalidate }
  );
  const deleteEntry = usePillarMutation<PlanDeleteEntryInput, PlanDeleteEntryOutput>(
    'food',
    ['plan', 'deleteEntry'],
    { onSuccess: invalidate }
  );
  const addSlot = usePillarMutation<PlanAddSlotInput, PlanAddSlotOutput>(
    'food',
    ['plan', 'addSlot'],
    { onSuccess: invalidate }
  );
  const updateSlot = usePillarMutation<PlanUpdateSlotInput, PlanUpdateSlotOutput>(
    'food',
    ['plan', 'updateSlot'],
    { onSuccess: invalidate }
  );
  const deleteSlot = usePillarMutation<PlanDeleteSlotInput, PlanDeleteSlotOutput>(
    'food',
    ['plan', 'deleteSlot'],
    { onSuccess: invalidate }
  );
  return {
    addEntry,
    updateEntry,
    moveEntry,
    reorderSlot,
    deleteEntry,
    addSlot,
    updateSlot,
    deleteSlot,
  };
}

export function usePlanPage({ weekParam, today }: UsePlanPageOpts) {
  const weekStart = safeIsoMonday(weekParam, today);
  const utils = usePillarUtils('food');
  const weekQuery = usePillarQuery<PlanWeekViewOutput>(
    'food',
    ['plan', 'weekView'],
    { weekStart },
    { refetchInterval: WEEK_POLL_INTERVAL_MS, refetchIntervalInBackground: false }
  );
  const slotsQuery = usePillarQuery<PlanListSlotsOutput>('food', ['plan', 'listSlots'], undefined, {
    refetchInterval: WEEK_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const invalidate = useCallback(() => {
    void utils.invalidate(['plan', 'weekView']);
    void utils.invalidate(['plan', 'listSlots']);
  }, [utils]);

  const mutations = usePlanMutations(invalidate);

  return {
    weekStart,
    weekQuery,
    slotsQuery,
    mutations,
  };
}

function formatToday(date: Date): string {
  const y = date.getFullYear().toString().padStart(4, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function safeIsoMonday(weekParam: string | null, today?: Date): string {
  const fallback = formatToday(today ?? new Date());
  if (weekParam === null) return toIsoMonday(fallback);
  try {
    return toIsoMonday(weekParam);
  } catch (err) {
    if (err instanceof BadClientDateError) return toIsoMonday(fallback);
    throw err;
  }
}
