/**
 * PRD-135 — inspector data hook.
 *
 * Mounts `food.inbox.getForReview` with conditional polling: 60 s while the
 * source's state is non-terminal (`pending` / `processing`), on-demand once
 * terminal. PRD-134's Drafts tab only navigates to terminal sources so the
 * polling branch is reserved for direct URL navigation during an in-flight
 * ingest.
 *
 * Exposes `invalidate()` so callers can refresh after Save, Approve, Reject,
 * Undo, or Re-run pipeline mutations.
 */
import { usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';

type InboxGetForReviewOutput = inferRouterOutputs<AppRouter>['food']['inbox']['getForReview'];

const POLL_INTERVAL_MS = 60_000;

export interface UseInspectorOptions {
  sourceId: number;
}

export function useInspector({ sourceId }: UseInspectorOptions) {
  const utils = usePillarUtils('food');
  const query = usePillarQuery<InboxGetForReviewOutput>(
    'food',
    ['inbox', 'getForReview'],
    { sourceId },
    {
      refetchInterval: (latest) => {
        const data = latest.state.data;
        if (data === undefined || !data.ok) return false;
        const state = data.review.source.state;
        if (state === 'pending' || state === 'processing') return POLL_INTERVAL_MS;
        return false;
      },
      refetchIntervalInBackground: false,
    }
  );
  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    invalidate: () => utils.invalidate(['inbox', 'getForReview']),
  };
}
