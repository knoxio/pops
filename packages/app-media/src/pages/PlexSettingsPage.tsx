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
import { ArrowLeft, ChevronDown, ChevronUp, RefreshCw, Save, Server } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { ConnectionBadge } from '../components/ConnectionBadge';
import { usePlexMutations } from './plex-settings/hooks/usePlexMutations';
import { usePlexSettings } from './plex-settings/hooks/usePlexSettings';
import { PlexAuthFlow } from './plex-settings/PlexAuthFlow';
import { PlexMediaSync } from './plex-settings/PlexMediaSync';
import { PlexScheduler } from './plex-settings/PlexScheduler';
import { PlexSyncHistory } from './plex-settings/PlexSyncHistory';
import { PlexWatchSync } from './plex-settings/PlexWatchSync';

// ---------------------------------------------------------------------------
// Result display components (tb-367 scope — left in-place for now)
// ---------------------------------------------------------------------------

interface SyncResult {
  synced: number;
  skipped: number;
  errors: { title: string; reason: string; year: number | null }[];
  skipReasons?: { title: string; reason: string; year: number | null }[];
}

interface WatchlistSyncResult {
  added: number;
  removed: number;
  skipped: number;
  errors: { title: string; reason: string }[];
  skipReasons?: { title: string; reason: string }[];
}

interface EpisodeMismatch {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
}

interface ShowWatchDiagnostics {
  title: string;
  tvdbId: number;
  plexViewedLeafCount: number | null;
  diagnostics: {
    plexTotal: number;
    plexWatched: number;
    matched: number;
    alreadyLogged: number;
    seasonNotFound: number;
    episodeNotFound: number;
    missingSeasonsPreview: number[];
    missingEpisodesPreview: EpisodeMismatch[];
  };
}

interface WatchHistorySyncResult {
  movies: {
    total: number;
    watched: number;
    logged: number;
    alreadyLogged: number;
    noLocalMatch: number;
  } | null;
  shows: ShowWatchDiagnostics[];
  summary: {
    moviesLogged: number;
    episodesLogged: number;
    episodesAlreadyLogged: number;
    showsProcessed: number;
    showsWithGaps: number;
  };
}

interface DiscoverMediaResult {
  total: number;
  watched: number;
  logged: number;
  alreadyLogged: number;
  added: number;
  notFound: number;
  errors: number;
  errorSamples?: string[];
}

interface DiscoverWatchSyncResult {
  movies: DiscoverMediaResult;
  tvShows: DiscoverMediaResult;
}

function SyncResultDisplay({ result, label }: { result: SyncResult; label: string }) {
  const [showErrors, setShowErrors] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const skipReasons = result.skipReasons ?? [];

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-medium">{label} Results:</span>
        <span className="text-emerald-400">{result.synced} synced</span>
        <span className="text-muted-foreground">{result.skipped} skipped</span>
        {result.errors.length > 0 && (
          <span className="text-red-400">{result.errors.length} errors</span>
        )}
      </div>
      {skipReasons.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSkipped(!showSkipped)}
            className="flex items-center gap-1 text-xs h-auto p-0 text-muted-foreground hover:text-foreground"
          >
            {showSkipped ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showSkipped ? 'Hide' : 'Show'} skip reasons
          </Button>
          {showSkipped && (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {skipReasons.map((skip, i) => (
                <p key={i}>
                  <span className="font-medium">{skip.title}:</span> {skip.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      {result.errors.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowErrors(!showErrors)}
            className="flex items-center gap-1 text-xs h-auto p-0 text-red-400 hover:text-red-300"
          >
            {showErrors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showErrors ? 'Hide' : 'Show'} error details
          </Button>
          {showErrors && (
            <div className="mt-2 space-y-1 text-xs text-red-400/80">
              {result.errors.map((err, i) => (
                <p key={i}>
                  <span className="font-medium">{err.title}:</span> {err.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WatchlistSyncResultDisplay({ result }: { result: WatchlistSyncResult }) {
  const [showErrors, setShowErrors] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const skipReasons = result.skipReasons ?? [];

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-medium">Watchlist Results:</span>
        <span className="text-emerald-400">{result.added} added</span>
        <span className="text-orange-400">{result.removed} removed</span>
        <span className="text-muted-foreground">{result.skipped} skipped</span>
        {result.errors.length > 0 && (
          <span className="text-red-400">{result.errors.length} errors</span>
        )}
      </div>
      {skipReasons.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSkipped(!showSkipped)}
            className="flex items-center gap-1 text-xs h-auto p-0 text-muted-foreground hover:text-foreground"
          >
            {showSkipped ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showSkipped ? 'Hide' : 'Show'} skip reasons
          </Button>
          {showSkipped && (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {skipReasons.map((skip, i) => (
                <p key={i}>
                  <span className="font-medium">{skip.title}:</span> {skip.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      {result.errors.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowErrors(!showErrors)}
            className="flex items-center gap-1 text-xs h-auto p-0 text-red-400 hover:text-red-300"
          >
            {showErrors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showErrors ? 'Hide' : 'Show'} error details
          </Button>
          {showErrors && (
            <div className="mt-2 space-y-1 text-xs text-red-400/80">
              {result.errors.map((err, i) => (
                <p key={i}>
                  <span className="font-medium">{err.title}:</span> {err.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DiscoverSyncResultDisplay({
  result,
  isRunning,
}: {
  result: DiscoverWatchSyncResult | null;
  isRunning: boolean;
}) {
  const [showErrors, setShowErrors] = useState(false);

  if (!result) return null;

  const r = result;
  const allErrors = [...(r.movies.errorSamples ?? []), ...(r.tvShows.errorSamples ?? [])];
  const totalAdded = (r.movies.added ?? 0) + (r.tvShows.added ?? 0);
  const totalLogged = r.movies.logged + r.tvShows.logged;
  const totalAlreadyLogged = r.movies.alreadyLogged + r.tvShows.alreadyLogged;
  const totalNotFound = r.movies.notFound + r.tvShows.notFound;
  const totalErrors = r.movies.errors + r.tvShows.errors;

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-medium">
          {isRunning ? 'Cloud Sync Progress:' : 'Cloud Sync Results:'}
        </span>
        {totalAdded > 0 && <span className="text-blue-400">{totalAdded} added to library</span>}
        {totalLogged > 0 && <span className="text-emerald-400">{totalLogged} watches logged</span>}
        {totalAlreadyLogged > 0 && (
          <span className="text-muted-foreground">{totalAlreadyLogged} already tracked</span>
        )}
        {totalNotFound > 0 && (
          <span className="text-muted-foreground">{totalNotFound} not found</span>
        )}
        {totalErrors > 0 && <span className="text-red-400">{totalErrors} errors</span>}
      </div>
      {!isRunning && (
        <p className="text-xs text-muted-foreground">
          Processed {r.movies.total} movie and {r.tvShows.total} TV episode activity entries
        </p>
      )}
      {allErrors.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowErrors(!showErrors)}
            className="flex items-center gap-1 text-xs h-auto p-0 text-red-400 hover:text-red-300"
          >
            {showErrors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showErrors ? 'Hide' : 'Show'} error details
          </Button>
          {showErrors && (
            <div className="mt-2 space-y-1 text-xs text-red-400/80">
              {allErrors.map((err, i) => (
                <p key={i}>{err}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WatchHistorySyncResultDisplay({ result }: { result: WatchHistorySyncResult }) {
  const [showShows, setShowShows] = useState(false);
  const [expandedShow, setExpandedShow] = useState<number | null>(null);

  const gapShows = result.shows.filter((s) => {
    const d = s.diagnostics;
    return d.seasonNotFound > 0 || d.episodeNotFound > 0;
  });

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-3 text-sm">
      {/* Summary */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-medium">Watch History Results:</span>
        {result.movies && result.movies.logged > 0 && (
          <span className="text-emerald-400">{result.movies.logged} movies logged</span>
        )}
        {result.summary.episodesLogged > 0 && (
          <span className="text-emerald-400">{result.summary.episodesLogged} episodes logged</span>
        )}
        {result.summary.episodesAlreadyLogged > 0 && (
          <span className="text-muted-foreground">
            {result.summary.episodesAlreadyLogged} episodes already tracked
          </span>
        )}
        <span className="text-muted-foreground">
          {result.summary.showsProcessed} shows processed
        </span>
        {result.summary.showsWithGaps > 0 && (
          <span className="text-amber-400">{result.summary.showsWithGaps} shows with gaps</span>
        )}
      </div>

      {/* Movie details */}
      {result.movies && result.movies.watched > 0 && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            Movies: {result.movies.watched} watched in Plex
            {result.movies.alreadyLogged > 0 && ` (${result.movies.alreadyLogged} already logged)`}
            {result.movies.noLocalMatch > 0 && (
              <span className="text-amber-400"> ({result.movies.noLocalMatch} not in library)</span>
            )}
          </p>
        </div>
      )}

      {/* Show-level details */}
      {gapShows.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowShows(!showShows)}
            className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
          >
            {showShows ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showShows ? 'Hide' : 'Show'} {gapShows.length} shows with matching issues
          </button>
          {showShows && (
            <div className="mt-2 space-y-1">
              {gapShows.map((show, i) => {
                const d = show.diagnostics;
                const isExpanded = expandedShow === i;
                return (
                  <div key={i} className="rounded border border-muted bg-background/50 p-2">
                    <button
                      type="button"
                      onClick={() => setExpandedShow(isExpanded ? null : i)}
                      className="flex items-center gap-2 w-full text-left text-xs"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      )}
                      <span className="font-medium flex-1">{show.title}</span>
                      <span className="text-muted-foreground">
                        {d.matched + d.alreadyLogged}/{d.plexWatched} tracked
                      </span>
                      {show.plexViewedLeafCount !== null && (
                        <span className="text-muted-foreground">
                          (Plex: {show.plexViewedLeafCount} watched)
                        </span>
                      )}
                    </button>
                    {isExpanded && (
                      <div className="mt-2 pl-5 space-y-1 text-xs text-muted-foreground">
                        <p>
                          Plex episodes: {d.plexTotal} total, {d.plexWatched} watched
                        </p>
                        <p>
                          Matched: {d.matched}
                          {d.alreadyLogged > 0 && ` | Already logged: ${d.alreadyLogged}`}
                        </p>
                        {d.seasonNotFound > 0 && (
                          <p className="text-amber-400">
                            Season not found: {d.seasonNotFound} episodes
                            {d.missingSeasonsPreview.length > 0 &&
                              ` (seasons: ${d.missingSeasonsPreview.join(', ')})`}
                          </p>
                        )}
                        {d.episodeNotFound > 0 && (
                          <div className="text-amber-400">
                            <p>Episode not found: {d.episodeNotFound} episodes</p>
                            {d.missingEpisodesPreview.length > 0 && (
                              <ul className="ml-3 mt-0.5">
                                {d.missingEpisodesPreview.map((ep, j) => (
                                  <li key={j}>
                                    S{String(ep.seasonNumber).padStart(2, '0')}E
                                    {String(ep.episodeNumber).padStart(2, '0')} — {ep.title}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

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
