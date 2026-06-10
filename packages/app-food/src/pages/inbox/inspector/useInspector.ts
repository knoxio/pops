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
import { trpc } from '@pops/api-client';

const POLL_INTERVAL_MS = 60_000;

export interface UseInspectorOptions {
  sourceId: number;
}

export function useInspector({ sourceId }: UseInspectorOptions) {
  const utils = trpc.useUtils();
  const query = trpc.food.inbox.getForReview.useQuery(
    { sourceId },
    {
      // PRD-135 — poll only while the source state is non-terminal. Direct
      // URL navigation to an in-flight source is the only path that
      // surfaces a `processing` source today; Drafts-tab clicks always land
      // on terminal rows.
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
    invalidate: () => utils.food.inbox.getForReview.invalidate({ sourceId }),
  };
}
