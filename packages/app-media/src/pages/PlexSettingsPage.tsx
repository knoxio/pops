/**
 * PlexSettingsPage — Plex Media Server connection status and sync controls.
 *
 * Shows connection health, available libraries, and sync buttons
 * for importing movies and TV shows from Plex into the local library.
 */
import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  Button,
  Skeleton,
  Input,
  Select,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@pops/ui";
import {
  ArrowLeft,
  RefreshCw,
  Film,
  Tv,
  AlertTriangle,
  Server,
  Save,
  Clock,
  Copy,
  ChevronDown,
  ChevronUp,
  History,
  Bookmark,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { ConnectionBadge } from "../components/ConnectionBadge";

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
          <button
            onClick={() => setShowSkipped(!showSkipped)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showSkipped ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {showSkipped ? "Hide" : "Show"} skip reasons
          </button>
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
          <button
            type="button"
            onClick={() => setShowErrors(!showErrors)}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            {showErrors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showErrors ? "Hide" : "Show"} error details
          </button>
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
      {result.errors.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowErrors(!showErrors)}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            {showErrors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showErrors ? "Hide" : "Show"} error details
          </button>
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

export function PlexSettingsPage() {
  const [movieSectionId, setMovieSectionId] = useState<string>("");
  const [tvSectionId, setTvSectionId] = useState<string>("");
  const [pinId, setPinId] = useState<number | null>(null);
  const [pinCode, setPinCode] = useState<string | null>(null);
  const [plexUrl, setPlexUrl] = useState<string>("");
  const [movieSyncResult, setMovieSyncResult] = useState<SyncResult | null>(null);
  const [tvSyncResult, setTvSyncResult] = useState<SyncResult | null>(null);
  const [watchlistSyncResult, setWatchlistSyncResult] = useState<WatchlistSyncResult | null>(null);
  const [schedulerHours, setSchedulerHours] = useState<number>(6);

  const syncStatus = trpc.media.plex.getSyncStatus.useQuery();
  const currentUrl = trpc.media.plex.getPlexUrl.useQuery();
  const savedSectionIds = trpc.media.plex.getSectionIds.useQuery();
  const schedulerStatus = trpc.media.plex.getSchedulerStatus.useQuery();
  const syncLogs = trpc.media.plex.getSyncLogs.useQuery({ limit: 10 });

  useEffect(() => {
    if (currentUrl.data?.data) {
      setPlexUrl(currentUrl.data.data);
    }
  }, [currentUrl.data?.data]);

  useEffect(() => {
    if (savedSectionIds.data?.data) {
      const { movieSectionId: savedMovie, tvSectionId: savedTv } = savedSectionIds.data.data;
      if (savedMovie) setMovieSectionId(savedMovie);
      if (savedTv) setTvSectionId(savedTv);
    }
  }, [savedSectionIds.data?.data]);

  useEffect(() => {
    if (schedulerStatus.data?.data) {
      const ms = schedulerStatus.data.data.intervalMs;
      setSchedulerHours(Math.max(1, Math.round(ms / (60 * 60 * 1000))));
    }
  }, [schedulerStatus.data?.data]);

  const connectionTest = trpc.media.plex.testConnection.useQuery(undefined, {
    enabled: syncStatus.data?.data.configured === true,
    retry: false,
  });
  const libraries = trpc.media.plex.getLibraries.useQuery(undefined, {
    enabled: connectionTest.data?.data.connected === true,
  });

  const syncMovies = trpc.media.plex.syncMovies.useMutation({
    onSuccess: (res: { data: SyncResult }) => {
      setMovieSyncResult(res.data);
      toast.success(`Movie sync complete: ${res.data.synced} synced, ${res.data.skipped} skipped`);
      syncStatus.refetch();
      syncLogs.refetch();
    },
    onError: (err: { message: string }) => toast.error(`Movie sync failed: ${err.message}`),
  });
  const syncTvShows = trpc.media.plex.syncTvShows.useMutation({
    onSuccess: (res: { data: SyncResult }) => {
      setTvSyncResult(res.data);
      toast.success(`TV sync complete: ${res.data.synced} synced, ${res.data.skipped} skipped`);
      syncStatus.refetch();
      syncLogs.refetch();
    },
    onError: (err: { message: string }) => toast.error(`TV show sync failed: ${err.message}`),
  });
  const syncWatchlist = trpc.media.plex.syncWatchlist.useMutation({
    onSuccess: (res: { data: WatchlistSyncResult; message: string }) => {
      setWatchlistSyncResult(res.data);
      toast.success(res.message);
    },
    onError: (err: { message: string }) => toast.error(`Watchlist sync failed: ${err.message}`),
  });
  const saveSectionIds = trpc.media.plex.saveSectionIds.useMutation({
    onError: (err: { message: string }) =>
      toast.error(`Failed to save library selection: ${err.message}`),
  });

  const saveUrl = trpc.media.plex.setUrl.useMutation({
    onSuccess: () => {
      toast.success("Server URL saved");
      syncStatus.refetch();
      connectionTest.refetch();
      currentUrl.refetch();
    },
    onError: (err: { message: string }) => {
      toast.error(`Failed to save URL: ${err.message}`);
    },
  });

  const getPin = trpc.media.plex.getAuthPin.useMutation({
    onSuccess: (res: { data: { id: number; code: string; clientId: string } }) => {
      const { id, code } = res.data;
      setPinId(id);
      setPinCode(code);
    },
    onError: (err: { message: string }) => {
      toast.error(`Failed to start auth: ${err.message}`);
    },
  });

  const checkPin = trpc.media.plex.checkAuthPin.useMutation({
    onSuccess: (res: { data: { connected: boolean } }) => {
      if (res.data.connected) {
        toast.success("Plex account connected");
        setPinId(null);
        setPinCode(null);
        syncStatus.refetch();
        connectionTest.refetch();
      }
    },
    onError: (err: { message: string }) => {
      toast.error(`Auth check failed: ${err.message}`);
    },
  });

  const disconnect = trpc.media.plex.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Plex account disconnected");
      syncStatus.refetch();
      connectionTest.refetch();
    },
    onError: (err: { message: string }) => toast.error(`Failed to disconnect: ${err.message}`),
  });

  const startScheduler = trpc.media.plex.startScheduler.useMutation({
    onSuccess: () => {
      toast.success("Scheduler started");
      schedulerStatus.refetch();
      syncLogs.refetch();
    },
    onError: (err: { message: string }) => toast.error(`Failed to start scheduler: ${err.message}`),
  });

  const stopScheduler = trpc.media.plex.stopScheduler.useMutation({
    onSuccess: () => {
      toast.success("Scheduler stopped");
      schedulerStatus.refetch();
    },
    onError: (err: { message: string }) => toast.error(`Failed to stop scheduler: ${err.message}`),
  });

  useEffect(() => {
    if (!pinId) return;
    const interval = setInterval(() => {
      checkPin.mutate({ id: pinId });
    }, 3000);
    return () => clearInterval(interval);
  }, [pinId]);

  const status = syncStatus.data?.data;
  const connected = connectionTest.data?.data.connected ?? false;
  const connectionError =
    connectionTest.data?.data && "error" in connectionTest.data.data
      ? connectionTest.data.data.error
      : undefined;
  const libraryList = libraries.data?.data ?? [];

  const movieLibraries = libraryList.filter((lib: { type: string }) => lib.type === "movie");
  const tvLibraries = libraryList.filter((lib: { type: string }) => lib.type === "show");

  const scheduler = schedulerStatus.data?.data;
  const isSchedulerRunning = scheduler?.isRunning ?? false;

  const isLoading = syncStatus.isLoading || currentUrl.isLoading;

  if (isLoading) {
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
        {status?.configured && <ConnectionBadge connected={connected} />}

        <div className="flex-1" />
        {status?.hasToken && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
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
            <label className="text-sm font-medium text-muted-foreground">
              Plex Media Server URL
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="http://192.168.1.100:32400"
                value={plexUrl}
                onChange={(e) => setPlexUrl(e.target.value)}
                className="flex-1"
                disabled={saveUrl.isPending}
              />
              <Button
                variant="outline"
                onClick={() => saveUrl.mutate({ url: plexUrl })}
                disabled={saveUrl.isPending || !plexUrl || plexUrl === currentUrl.data?.data}
              >
                {saveUrl.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
            </div>
            {saveUrl.error && <p className="text-xs text-red-400 mt-1">{saveUrl.error.message}</p>}
            {!status?.hasUrl && (
              <p className="text-xs text-amber-400">
                Please set your Plex server URL to enable connection.
              </p>
            )}
          </div>
        </div>

        {/* Authentication */}
        {!status?.hasToken ? (
          <div className="rounded-lg border bg-card p-6 text-center space-y-4">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Plex Account</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Link your Plex account to enable library syncing and watch history tracking.
              </p>
            </div>

            <div className="pt-2">
              {pinId && pinCode ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Enter this code at{" "}
                      <a
                        href="https://plex.tv/link"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline"
                      >
                        plex.tv/link
                      </a>
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <code className="text-3xl font-mono font-bold tracking-widest bg-muted px-4 py-2 rounded-lg">
                        {pinCode}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(pinCode);
                          toast.success("Code copied");
                        }}
                        aria-label="Copy PIN code"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-amber-400">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Checking for authentication...</span>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPinId(null);
                      setPinCode(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button onClick={() => getPin.mutate()} disabled={getPin.isPending}>
                  {getPin.isPending ? "Requesting..." : "Connect to Plex"}
                </Button>
              )}
              {getPin.error && <p className="text-xs text-red-400 mt-2">{getPin.error.message}</p>}
            </div>
          </div>
        ) : !status?.configured ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="text-sm text-amber-200">
              Authenticated with Plex account, but server URL is missing. Set the URL above to
              finish setup.
            </div>
          </div>
        ) : null}

        {/* Connection error */}
        {connectionError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">Connection Failed</p>
              <p>{connectionError}</p>
              <p className="text-xs opacity-70">
                Verify that the server URL is correct and the server is reachable from this
                application.
              </p>
            </div>
          </div>
        )}

        {/* Sync controls */}
        {connected && (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Movie sync */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Film className="h-4 w-4" />
                Sync Movies
              </div>

              {movieLibraries.length > 0 ? (
                <>
                  <Select
                    value={movieSectionId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setMovieSectionId(id);
                      if (id) saveSectionIds.mutate({ movieSectionId: id });
                    }}
                    size="sm"
                    placeholder="Select library..."
                    options={movieLibraries.map(
                      (lib: { key: string; title: string; type: string }) => ({
                        value: lib.key,
                        label: lib.title,
                      })
                    )}
                    aria-label="Select movie library"
                  />

                  <Button
                    size="sm"
                    disabled={!movieSectionId || syncMovies.isPending}
                    onClick={() => {
                      setMovieSyncResult(null);
                      syncMovies.mutate({ sectionId: movieSectionId });
                    }}
                    className="w-full"
                  >
                    {syncMovies.isPending ? (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {syncMovies.isPending ? "Syncing..." : "Sync Movies"}
                  </Button>

                  {movieSyncResult && <SyncResultDisplay result={movieSyncResult} label="Movie" />}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No movie libraries found</p>
              )}
            </div>

            {/* TV sync */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Tv className="h-4 w-4" />
                Sync TV Shows
              </div>

              {tvLibraries.length > 0 ? (
                <>
                  <Select
                    value={tvSectionId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setTvSectionId(id);
                      if (id) saveSectionIds.mutate({ tvSectionId: id });
                    }}
                    size="sm"
                    placeholder="Select library..."
                    options={tvLibraries.map(
                      (lib: { key: string; title: string; type: string }) => ({
                        value: lib.key,
                        label: lib.title,
                      })
                    )}
                    aria-label="Select TV library"
                  />

                  <Button
                    size="sm"
                    disabled={!tvSectionId || syncTvShows.isPending}
                    onClick={() => {
                      setTvSyncResult(null);
                      syncTvShows.mutate({ sectionId: tvSectionId });
                    }}
                    className="w-full"
                  >
                    {syncTvShows.isPending ? (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {syncTvShows.isPending ? "Syncing..." : "Sync TV Shows"}
                  </Button>

                  {tvSyncResult && <SyncResultDisplay result={tvSyncResult} label="TV" />}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No TV libraries found</p>
              )}
            </div>
          </div>
        )}

        {/* Watchlist Sync */}
        {connected && (
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
              disabled={syncWatchlist.isPending}
              onClick={() => {
                setWatchlistSyncResult(null);
                syncWatchlist.mutate();
              }}
            >
              {syncWatchlist.isPending ? (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              {syncWatchlist.isPending ? "Syncing..." : "Sync Watchlist"}
            </Button>
            {watchlistSyncResult && (
              <WatchlistSyncResultDisplay result={watchlistSyncResult} />
            )}
          </div>
        )}

        {/* Scheduler */}
        {connected && (
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Auto Sync Scheduler</h2>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label htmlFor="scheduler-hours" className="text-sm text-muted-foreground">
                  Sync every
                </label>
                <Input
                  id="scheduler-hours"
                  type="number"
                  min={1}
                  max={168}
                  value={schedulerHours}
                  onChange={(e) => setSchedulerHours(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20"
                  disabled={isSchedulerRunning}
                />
                <span className="text-sm text-muted-foreground">hours</span>
              </div>

              {isSchedulerRunning ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => stopScheduler.mutate()}
                  disabled={stopScheduler.isPending}
                >
                  {stopScheduler.isPending ? (
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : null}
                  Stop Scheduler
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() =>
                    startScheduler.mutate({
                      intervalMs: schedulerHours * 60 * 60 * 1000,
                      movieSectionId: movieSectionId || undefined,
                      tvSectionId: tvSectionId || undefined,
                    })
                  }
                  disabled={startScheduler.isPending}
                >
                  {startScheduler.isPending ? (
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : null}
                  Start Scheduler
                </Button>
              )}
            </div>

            {/* Scheduler status */}
            <div className="text-sm text-muted-foreground space-y-1">
              {isSchedulerRunning ? (
                <>
                  <p className="text-emerald-400">
                    Scheduler active — syncing every{" "}
                    {Math.round((scheduler?.intervalMs ?? 0) / (60 * 60 * 1000))} hours
                  </p>
                  {scheduler?.nextSyncAt && (
                    <p>Next sync: {new Date(scheduler.nextSyncAt).toLocaleTimeString()}</p>
                  )}
                </>
              ) : (
                <p>Scheduler off</p>
              )}
              {scheduler?.lastSyncAt && (
                <p>Last sync: {new Date(scheduler.lastSyncAt).toLocaleString()}</p>
              )}
              {scheduler?.lastSyncError && (
                <p className="text-red-400">Last error: {scheduler.lastSyncError}</p>
              )}
              {(scheduler?.moviesSynced ?? 0) > 0 && (
                <p>Total movies synced: {scheduler?.moviesSynced}</p>
              )}
              {(scheduler?.tvShowsSynced ?? 0) > 0 && (
                <p>Total TV shows synced: {scheduler?.tvShowsSynced}</p>
              )}
            </div>
          </div>
        )}

        {/* Sync History */}
        {connected && syncLogs.data?.data && syncLogs.data.data.length > 0 && (
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Sync History</h2>
            </div>

            <div className="space-y-2">
              {syncLogs.data.data.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 flex-wrap rounded-md border bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground min-w-[140px]">
                    {new Date(log.syncedAt).toLocaleString()}
                  </span>
                  <span className="text-emerald-400">{log.moviesSynced} movies</span>
                  <span className="text-blue-400">{log.tvShowsSynced} TV</span>
                  {log.durationMs != null && (
                    <span className="text-muted-foreground text-xs">
                      {(log.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  {log.errors && log.errors.length > 0 && (
                    <span className="text-red-400 text-xs">
                      {log.errors.length} error{log.errors.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
