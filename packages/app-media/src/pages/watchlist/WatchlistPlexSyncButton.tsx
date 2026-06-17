/**
 * WatchlistPlexSyncButton — header action that pushes the POPS watchlist to
 * Plex Discover via the `plexSyncWatchlist` background job.
 *
 * Wraps {@link useSyncJob} so the click triggers a job, the button reflects
 * the running state (spinner + "Syncing…" copy + disabled), and on completion
 * the watchlist list query is invalidated to surface any rows newly written
 * by the sync (e.g. items pulled back from Plex during a bidirectional pass).
 *
 * Toasts ("Watchlist sync complete" / "failed") are emitted by the hook
 * itself — this component owns only the UI affordance and cache invalidation.
 */
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { Button } from '@pops/ui';

import { useSyncJob } from '../../hooks/useSyncJob';

export function WatchlistPlexSyncButton() {
  const queryClient = useQueryClient();
  const sync = useSyncJob('plexSyncWatchlist');
  const previousStatusRef = useRef(sync.status);

  // Invalidate the watchlist list query on the running → completed transition
  // so any rows the sync wrote on the server reappear in the UI. Tracking the
  // previous status (rather than just `status === 'completed'`) avoids firing
  // the invalidation on every render after a completed job is restored from
  // history.
  useEffect(() => {
    if (previousStatusRef.current === 'running' && sync.status === 'completed') {
      void queryClient.invalidateQueries({ queryKey: ['media', 'watchlist', 'list'] });
    }
    previousStatusRef.current = sync.status;
  }, [sync.status, queryClient]);

  const busy = sync.isStarting || sync.isRunning;

  return (
    <Button
      variant="outline"
      size="sm"
      aria-label="Sync watchlist with Plex"
      disabled={busy}
      onClick={() => sync.start()}
      data-testid="watchlist-plex-sync-button"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4 mr-1.5" />
      )}
      {busy ? 'Syncing…' : 'Sync with Plex'}
    </Button>
  );
}
