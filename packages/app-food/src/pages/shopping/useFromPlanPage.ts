/**
 * Data hook for the FromPlanPage — PRD-152.
 *
 * Drives `food.shopping.previewFromPlan` from the user-picked range and
 * exposes `generateFromPlan` so the page stays free of tRPC plumbing.
 *
 * No polling — the preview is a snapshot at range-change time.
 */
import { useCallback } from 'react';

import { trpc } from '@pops/api-client';

import { validateRange } from './range-helpers.js';

export interface UseFromPlanPageOpts {
  startDate: string;
  endDate: string;
}

export function useFromPlanPage(opts: UseFromPlanPageOpts) {
  const utils = trpc.useUtils();
  const isValid = validateRange(opts.startDate, opts.endDate).ok;
  const previewQuery = trpc.food.shopping.previewFromPlan.useQuery(
    { startDate: opts.startDate, endDate: opts.endDate },
    {
      enabled: isValid,
      staleTime: 30_000,
    }
  );
  const generateMutation = trpc.food.shopping.generateFromPlan.useMutation();

  const refresh = useCallback(() => {
    void utils.food.shopping.previewFromPlan.invalidate();
  }, [utils]);

  return { previewQuery, generateMutation, refresh } as const;
}
