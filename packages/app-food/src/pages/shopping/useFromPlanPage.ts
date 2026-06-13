/**
 * Data hook for the FromPlanPage — PRD-152.
 *
 * Drives `food.shopping.previewFromPlan` from the user-picked range and
 * exposes `generateFromPlan` so the page stays free of tRPC plumbing.
 *
 * No polling — the preview is a snapshot at range-change time.
 */
import { useCallback } from 'react';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

import { validateRange } from './range-helpers.js';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';

type PreviewFromPlanOutput = inferRouterOutputs<AppRouter>['food']['shopping']['previewFromPlan'];
type GenerateFromPlanInput = inferRouterInputs<AppRouter>['food']['shopping']['generateFromPlan'];
type GenerateFromPlanOutput = inferRouterOutputs<AppRouter>['food']['shopping']['generateFromPlan'];

export interface UseFromPlanPageOpts {
  startDate: string;
  endDate: string;
}

export function useFromPlanPage(opts: UseFromPlanPageOpts) {
  const utils = usePillarUtils('food');
  const isValid = validateRange(opts.startDate, opts.endDate).ok;
  const previewQuery = usePillarQuery<PreviewFromPlanOutput>(
    'food',
    ['shopping', 'previewFromPlan'],
    { startDate: opts.startDate, endDate: opts.endDate },
    {
      enabled: isValid,
      staleTime: 30_000,
    }
  );
  const generateMutation = usePillarMutation<GenerateFromPlanInput, GenerateFromPlanOutput>(
    'food',
    ['shopping', 'generateFromPlan']
  );

  const refresh = useCallback(() => {
    void utils.invalidate(['shopping', 'previewFromPlan']);
  }, [utils]);

  return { previewQuery, generateMutation, refresh } as const;
}
