/**
 * Data hook for the FromPlanPage — PRD-152.
 *
 * Drives `food.shopping.previewFromPlan` from the user-picked range and
 * exposes `generateFromPlan` so the page stays free of tRPC plumbing.
 *
 * No polling — the preview is a snapshot at range-change time.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { unwrap } from '../../food-api-helpers.js';
import { shoppingGenerate, shoppingPreview } from '../../food-api/index.js';
import { validateRange } from './range-helpers.js';

import type { ShoppingGenerateData } from '../../food-api/types.gen.js';

type GenerateFromPlanInput = NonNullable<ShoppingGenerateData['body']>;

export interface UseFromPlanPageOpts {
  startDate: string;
  endDate: string;
}

export function useFromPlanPage(opts: UseFromPlanPageOpts) {
  const queryClient = useQueryClient();
  const isValid = validateRange(opts.startDate, opts.endDate).ok;
  const previewInput = { startDate: opts.startDate, endDate: opts.endDate };
  const previewQuery = useQuery({
    queryKey: ['food', 'shopping', 'preview', previewInput],
    queryFn: async () => unwrap(await shoppingPreview({ body: previewInput })),
    enabled: isValid,
    staleTime: 30_000,
  });
  const generateMutation = useMutation({
    mutationFn: async (input: GenerateFromPlanInput) =>
      unwrap(await shoppingGenerate({ body: input })),
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['food', 'shopping', 'preview'] });
  }, [queryClient]);

  return { previewQuery, generateMutation, refresh } as const;
}
