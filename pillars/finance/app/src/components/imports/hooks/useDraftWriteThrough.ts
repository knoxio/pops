import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { draftPayloadChanged, hasDraftWorthyState } from '../../../store/import-draft-payload';
import { useImportStore } from '../../../store/importStore';
import { DraftWriter, type WriteThroughCallbacks } from './draft-writer';

export { DRAFT_HEARTBEAT_MS, DRAFT_WRITE_DEBOUNCE_MS } from './draft-writer';

/** Query key for the pending-imports list; invalidated by anything that changes a card. */
export const IMPORT_DRAFTS_LIST_KEY = ['finance', 'import-drafts', 'list'] as const;

/**
 * One subscription over the store that mirrors it into the server draft
 * (finance ADR-005). Extracted from the hook so the scheduling can be
 * tested with fake timers and no React.
 *
 * - No draft yet: the first snapshot with an account and parsed rows
 *   creates one; anything that changed while the create was in flight is
 *   written as soon as the id is known.
 * - A step change writes at once; any other change waits two seconds for
 *   the next one, so a run of edits on Review costs one request.
 * - `pagehide` flushes whatever is pending with `keepalive` and releases
 *   the lease in the same request. Stopping does the same, then releases.
 * - While a draft is known the tab heartbeats every thirty seconds, so the
 *   card elsewhere reads `open` and a takeover is noticed within one beat.
 * - A 409 `DraftOwnedElsewhere` on any write or heartbeat stops every further
 *   write: the draft is another tab's now, and writing on would overwrite
 *   its decisions. The caller decides what to show.
 */
export function startDraftWriteThrough(callbacks: WriteThroughCallbacks): () => void {
  const writer = new DraftWriter(callbacks);
  if (useImportStore.getState().draftId !== null) writer.startHeartbeat();

  const unsubscribe = useImportStore.subscribe((state, prev) => {
    if (writer.stopped()) return;
    if (state.draftId === null) {
      if (hasDraftWorthyState(state)) writer.create(state);
      return;
    }
    if (prev.draftId === null) return;
    if (!draftPayloadChanged(state, prev)) return;
    writer.schedule(state.currentStep !== prev.currentStep);
  });

  const onHide = () => {
    if (writer.pending()) void writer.write({ release: true, keepalive: true });
    else void writer.release(true);
  };
  window.addEventListener('pagehide', onHide);

  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', onHide);
    writer.stopHeartbeat();
    if (writer.pending()) {
      void writer.write({ release: true });
      return;
    }
    void writer.settled().then(() => writer.release(false));
  };
}

export interface DraftWriteThroughOptions {
  enabled: boolean;
  /**
   * Bump to start a fresh write-through after the lease was lost and taken
   * back: the latched one never writes again, by design.
   */
  epoch: number;
  onOwnedElsewhere: () => void;
  onSaveFailed: () => void;
}

/**
 * Mirror the wizard store into its server draft while `enabled`. Mount it
 * once the page knows which draft it is on (or that it is on none yet).
 */
export function useDraftWriteThrough(options: DraftWriteThroughOptions): void {
  const queryClient = useQueryClient();
  const latest = useRef(options);
  latest.current = options;
  const { enabled, epoch } = options;
  useEffect(() => {
    if (!enabled) return;
    return startDraftWriteThrough({
      onDraftCreated: () =>
        void queryClient.invalidateQueries({ queryKey: IMPORT_DRAFTS_LIST_KEY }),
      onOwnedElsewhere: () => latest.current.onOwnedElsewhere(),
      onSaveFailed: () => latest.current.onSaveFailed(),
    });
  }, [enabled, epoch, queryClient]);
}
