/**
 * PlexSettingsPage — Plex Media Server connection status and sync controls.
 *
 * Shows connection health, available libraries, and sync buttons
 * for importing movies and TV shows from Plex into the local library.
 */
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Input,
  Label,
  Skeleton,
} from '@pops/ui';
import { ArrowLeft, RefreshCw, Save, Server } from 'lucide-react';
import { Link } from 'react-router';

import { ConnectionBadge } from '../components/ConnectionBadge';
import { DiscoverSyncResultDisplay } from './plex-settings/components/DiscoverSyncResultDisplay';
import { SyncResultDisplay } from './plex-settings/components/SyncResultDisplay';
import { WatchHistorySyncResultDisplay } from './plex-settings/components/WatchHistorySyncResultDisplay';
import { WatchlistSyncResultDisplay } from './plex-settings/components/WatchlistSyncResultDisplay';
import { usePlexMutations } from './plex-settings/hooks/usePlexMutations';
import { usePlexSettings } from './plex-settings/hooks/usePlexSettings';
import { PlexAuthFlow } from './plex-settings/PlexAuthFlow';
import { PlexMediaSync } from './plex-settings/PlexMediaSync';
import { PlexScheduler } from './plex-settings/PlexScheduler';
import { PlexSyncHistory } from './plex-settings/PlexSyncHistory';
import { PlexWatchSync } from './plex-settings/PlexWatchSync';

export function PlexSettingsPage() {
  const settings = usePlexSettings();
  const mutations = usePlexMutations({
    pinId: settings.pinId,
    setPinId: settings.setPinId,
    setPinCode: settings.setPinCode,
    syncStatus: settings.syncStatus,
    connectionTest: settings.connectionTest,
    currentUrl: settings.currentUrl,
    schedulerStatus: settings.schedulerStatus,
    syncLogs: settings.syncLogs,
  });

  if (settings.isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/media">Media</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Plex Settings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/media"
          className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
          aria-label="Back to Media"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Plex Settings</h1>
        {settings.status?.configured && <ConnectionBadge connected={settings.connected} />}

        <div className="flex-1" />
        {settings.status?.hasToken && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutations.disconnect.mutate()}
            disabled={mutations.disconnect.isPending}
          >
            Disconnect
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Connect your Plex Media Server to sync your movie and TV libraries, track watch history, and
        schedule automatic syncs.
      </p>

      <div className="grid gap-6">
        {/* URL Configuration */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Server Configuration</h2>
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">Plex Media Server URL</Label>
            <div className="flex gap-2">
              <Input
                placeholder="http://192.168.1.100:32400"
                value={settings.plexUrl}
                onChange={(e) => settings.setPlexUrl(e.target.value)}
                className="flex-1"
                disabled={mutations.saveUrl.isPending}
              />
              <Button
                variant="outline"
                onClick={() => mutations.saveUrl.mutate({ url: settings.plexUrl })}
                disabled={
                  mutations.saveUrl.isPending ||
                  !settings.plexUrl ||
                  settings.plexUrl === settings.currentUrl.data?.data
                }
              >
                {mutations.saveUrl.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
            </div>
            {mutations.saveUrl.error && (
              <p className="text-xs text-red-400 mt-1">{mutations.saveUrl.error.message}</p>
            )}
            {!settings.status?.hasUrl && (
              <p className="text-xs text-amber-400">
                Please set your Plex server URL to enable connection.
              </p>
            )}
          </div>
        </div>

        <PlexAuthFlow
          status={settings.status}
          pinId={settings.pinId}
          pinCode={settings.pinCode}
          setPinId={settings.setPinId}
          setPinCode={settings.setPinCode}
          getPin={mutations.getPin}
          connectionError={settings.connectionError}
        />

        {/* Sync controls */}
        {settings.connected && (
          <PlexMediaSync
            movieSectionId={settings.movieSectionId}
            setMovieSectionId={settings.setMovieSectionId}
            tvSectionId={settings.tvSectionId}
            setTvSectionId={settings.setTvSectionId}
            movieLibraries={settings.movieLibraries}
            tvLibraries={settings.tvLibraries}
            movieSync={settings.movieSync}
            tvSync={settings.tvSync}
            saveSectionIds={mutations.saveSectionIds}
            SyncResultDisplay={SyncResultDisplay}
          />
        )}

        {settings.connected && (
          <PlexWatchSync
            movieSectionId={settings.movieSectionId}
            tvSectionId={settings.tvSectionId}
            watchlistSync={settings.watchlistSync}
            watchHistorySync={settings.watchHistorySync}
            discoverSync={settings.discoverSync}
            WatchlistSyncResultDisplay={WatchlistSyncResultDisplay}
            WatchHistorySyncResultDisplay={WatchHistorySyncResultDisplay}
            DiscoverSyncResultDisplay={DiscoverSyncResultDisplay}
          />
        )}

        {settings.connected && (
          <PlexScheduler
            schedulerHours={settings.schedulerHours}
            setSchedulerHours={settings.setSchedulerHours}
            movieSectionId={settings.movieSectionId}
            tvSectionId={settings.tvSectionId}
            scheduler={settings.scheduler}
            isSchedulerRunning={settings.isSchedulerRunning}
            startScheduler={mutations.startScheduler}
            stopScheduler={mutations.stopScheduler}
          />
        )}

        {settings.connected && settings.syncLogs.data?.data && (
          <PlexSyncHistory syncLogs={settings.syncLogs.data.data} />
        )}
      </div>
    </div>
  );
}
