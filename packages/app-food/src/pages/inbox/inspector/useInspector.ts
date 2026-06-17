/**
 * PRD-135 — inspector data hook.
 *
 * Mounts `inbox.getForReview` with conditional polling: 60 s while the
 * source's state is non-terminal (`pending` / `processing`), on-demand once
 * terminal. PRD-134's Drafts tab only navigates to terminal sources so the
 * polling branch is reserved for direct URL navigation during an in-flight
 * ingest.
 *
 * Exposes `invalidate()` so callers can refresh after Save, Approve, Reject,
 * Undo, or Re-run pipeline mutations.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { unwrap } from '../../../food-api-helpers.js';
import { inboxGetForReview } from '../../../food-api/index.js';

import type { InspectorResult, InspectorReviewView } from './inspector-wire-types.js';

const POLL_INTERVAL_MS = 60_000;

export interface UseInspectorOptions {
  sourceId: number;
}

/**
 * The pillar serves `review` as an opaque JSON blob (`unknown` in the
 * generated SDK). We narrow it to the structured `InspectorReviewView` the
 * panes consume; the field comes straight from `unknown`, so this is a
 * single narrowing assertion, not a double-cast.
 */
function toInspectorResult(
  raw: { ok: true; review: unknown } | { ok: false; reason: string }
): InspectorResult {
  if (!raw.ok) return { ok: false, reason: 'SourceNotFound' };
  return { ok: true, review: raw.review as InspectorReviewView };
}

export function useInspector({ sourceId }: UseInspectorOptions) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['food', 'inbox', 'getForReview', { sourceId }],
    queryFn: async () =>
      toInspectorResult(unwrap(await inboxGetForReview({ query: { sourceId } }))),
    refetchInterval: (q) => {
      const data = q.state.data;
      if (data === undefined || !data.ok) return false;
      const state = data.review.source.state;
      if (state === 'pending' || state === 'processing') return POLL_INTERVAL_MS;
      return false;
    },
    refetchIntervalInBackground: false,
  });
  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    invalidate: () => qc.invalidateQueries({ queryKey: ['food', 'inbox', 'getForReview'] }),
  };
}
