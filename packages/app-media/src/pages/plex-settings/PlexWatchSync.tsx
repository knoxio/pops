import { Bookmark, Eye, History, RefreshCw } from 'lucide-react';

import { Button } from '@pops/ui';

import type { DiscoverWatchSyncResult, WatchHistorySyncResult, WatchlistSyncResult } from './types';

interface SyncJob {
  isRunning: boolean;
  isStarting: boolean;
  progress: { processed: number; total: number } | null;
  result: unknown;
  start: (params?: { movieSectionId?: string; tvSectionId?: string }) => void;
}

interface PlexWatchSyncProps {
  movieSectionId: string;
  tvSectionId: string;
  watchlistSync: SyncJob;
  watchHistorySync: SyncJob;
  discoverSync: SyncJob;
  WatchlistSyncResultDisplay: React.ComponentType<{ result: WatchlistSyncResult }>;
  WatchHistorySyncResultDisplay: React.ComponentType<{ result: WatchHistorySyncResult }>;
  DiscoverSyncResultDisplay: React.ComponentType<{
    result: DiscoverWatchSyncResult | null;
    isRunning: boolean;
  }>;
}

export function PlexWatchSync({
  movieSectionId,
  tvSectionId,
  watchlistSync,
  watchHistorySync,
  discoverSync,
  WatchlistSyncResultDisplay,
  WatchHistorySyncResultDisplay,
  DiscoverSyncResultDisplay,
}: PlexWatchSyncProps) {
  return (
    <>
      {/* Watchlist Sync */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Bookmark className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Watchlist Sync</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Sync your Plex watchlist to POPS. Items added or removed on Plex will be reflected
          locally.
        </p>
        <Button
          size="sm"
          disabled={watchlistSync.isRunning || watchlistSync.isStarting}
          onClick={() => {
            watchlistSync.start();
          }}
        >
          {watchlistSync.isRunning ? (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          {watchlistSync.isRunning && watchlistSync.progress
            ? `Syncing... ${watchlistSync.progress.processed}/${watchlistSync.progress.total}`
            : 'Sync Watchlist'}
        </Button>
        {watchlistSync.result != null && (
          <WatchlistSyncResultDisplay result={watchlistSync.result as WatchlistSyncResult} />
        )}
      </div>

      {/* Watch History Sync */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Watch History Sync</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Re-sync watch history from Plex for movies and TV shows already in your library. Shows
          detailed diagnostics about what matched and what was missed.
        </p>
        <Button
          size="sm"
          disabled={
            watchHistorySync.isRunning ||
            watchHistorySync.isStarting ||
            (!movieSectionId && !tvSectionId)
          }
          onClick={() => {
            watchHistorySync.start({
              movieSectionId: movieSectionId || undefined,
              tvSectionId: tvSectionId || undefined,
            });
          }}
        >
          {watchHistorySync.isRunning ? (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <History className="h-3.5 w-3.5 mr-1.5" />
          )}
          {watchHistorySync.isRunning && watchHistorySync.progress
            ? `Syncing... ${watchHistorySync.progress.processed}/${watchHistorySync.progress.total}`
            : 'Sync Watch History'}
        </Button>
        {!movieSectionId && !tvSectionId && (
          <p className="text-xs text-amber-400">Select a movie or TV library above first.</p>
        )}
        {watchHistorySync.result != null && (
          <WatchHistorySyncResultDisplay
            result={watchHistorySync.result as WatchHistorySyncResult}
          />
        )}
      </div>

      {/* Plex Discover Cloud Watch Sync */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Plex Cloud Watch Sync</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Sync your full Plex cloud activity history into POPS. For each movie and TV episode
          you&apos;ve watched — adds it to your library if missing and logs the watch if not already
          tracked. Catches streaming services (Netflix, Disney+, etc.) and other Plex servers. This
          may take several minutes on first run.
        </p>
        <Button
          size="sm"
          disabled={discoverSync.isRunning || discoverSync.isStarting}
          onClick={() => {
            discoverSync.start();
          }}
        >
          {discoverSync.isRunning ? (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Eye className="h-3.5 w-3.5 mr-1.5" />
          )}
          {discoverSync.isRunning && discoverSync.progress
            ? `Checking... ${discoverSync.progress.processed}/${discoverSync.progress.total}`
            : 'Sync Cloud Watches'}
        </Button>
        <DiscoverSyncResultDisplay
          result={discoverSync.result as DiscoverWatchSyncResult | null}
          isRunning={discoverSync.isRunning}
        />
      </div>
    </>
  );
}
