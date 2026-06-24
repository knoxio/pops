import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
/**
 * Data hook for the planning page: polls the plan week view at
 * `WEEK_POLL_INTERVAL_MS` and exposes mutation helpers that invalidate the
 * week query on success.
 *
 * Spec: pillars/food/docs/prds/planning-page
 */
import { useCallback } from 'react';

import { unwrap } from '../../food-api-helpers.js';
import {
  planAddEntry,
  planAddSlot,
  planDeleteEntry,
  planDeleteSlot,
  planListSlots,
  planMoveEntry,
  planReorderSlot,
  planUpdateEntry,
  planUpdateSlot,
  planWeekView,
} from '../../food-api/index.js';
import { BadClientDateError, toIsoMonday } from './iso-week.js';

import type {
  PlanAddEntryData,
  PlanAddSlotData,
  PlanDeleteEntryData,
  PlanDeleteSlotData,
  PlanMoveEntryData,
  PlanReorderSlotData,
  PlanUpdateEntryData,
  PlanUpdateSlotData,
} from '../../food-api/types.gen.js';

type PlanAddEntryInput = NonNullable<PlanAddEntryData['body']>;
type PlanUpdateEntryInput = NonNullable<PlanUpdateEntryData['body']> & { id: number };
type PlanMoveEntryInput = NonNullable<PlanMoveEntryData['body']> & { id: number };
type PlanReorderSlotInput = NonNullable<PlanReorderSlotData['body']>;
type PlanDeleteEntryInput = PlanDeleteEntryData['path'];
type PlanAddSlotInput = NonNullable<PlanAddSlotData['body']>;
type PlanUpdateSlotInput = NonNullable<PlanUpdateSlotData['body']> & { slug: string };
type PlanDeleteSlotInput = PlanDeleteSlotData['path'];

const WEEK_POLL_INTERVAL_MS = 60_000;

export interface UsePlanPageOpts {
  weekParam: string | null;
  /** Pinned "today" for tests. */
  today?: Date;
}

function usePlanMutations(invalidate: () => void) {
  const addEntry = useMutation({
    mutationFn: async (input: PlanAddEntryInput) => unwrap(await planAddEntry({ body: input })),
    onSuccess: invalidate,
  });
  const updateEntry = useMutation({
    mutationFn: async ({ id, ...body }: PlanUpdateEntryInput) =>
      unwrap(await planUpdateEntry({ path: { id }, body })),
    onSuccess: invalidate,
  });
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
  const deleteEntry = useMutation({
    mutationFn: async (input: PlanDeleteEntryInput) =>
      unwrap(await planDeleteEntry({ path: input })),
    onSuccess: invalidate,
  });
  const addSlot = useMutation({
    mutationFn: async (input: PlanAddSlotInput) => unwrap(await planAddSlot({ body: input })),
    onSuccess: invalidate,
  });
  const updateSlot = useMutation({
    mutationFn: async ({ slug, ...body }: PlanUpdateSlotInput) =>
      unwrap(await planUpdateSlot({ path: { slug }, body })),
    onSuccess: invalidate,
  });
  const deleteSlot = useMutation({
    mutationFn: async (input: PlanDeleteSlotInput) => unwrap(await planDeleteSlot({ path: input })),
    onSuccess: invalidate,
  });
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
  const queryClient = useQueryClient();
  const weekQuery = useQuery({
    queryKey: ['food', 'plan', 'weekView', { weekStart }],
    queryFn: async () => unwrap(await planWeekView({ query: { weekStart } })),
    refetchInterval: WEEK_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
  const slotsQuery = useQuery({
    queryKey: ['food', 'plan', 'listSlots'],
    queryFn: async () => unwrap(await planListSlots()),
    refetchInterval: WEEK_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['food', 'plan', 'weekView'] });
    void queryClient.invalidateQueries({ queryKey: ['food', 'plan', 'listSlots'] });
  }, [queryClient]);

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
