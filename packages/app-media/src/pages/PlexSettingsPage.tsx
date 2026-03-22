/**
 * PlexSettingsPage — Plex Media Server connection status and sync controls.
 *
 * Shows connection health, available libraries, and sync buttons
 * for importing movies and TV shows from Plex into the local library.
 */
import { useState } from "react";
import { Link } from "react-router";
import { Badge, Button, Skeleton } from "@pops/ui";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Film,
  Tv,
  AlertTriangle,
  Server,
} from "lucide-react";
import { trpc } from "../lib/trpc";

function ConnectionBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      Connected
    </Badge>
  ) : (
    <Badge className="bg-red-500/10 text-red-400 border-red-500/20">
      <XCircle className="h-3 w-3 mr-1" />
      Disconnected
    </Badge>
  );
}

function SyncResultCard({
  label,
  icon: Icon,
  result,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  result: {
    synced: number;
    skipped: number;
    errors: { title: string; reason: string }[];
  } | null;
}) {
  if (!result) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">No sync data yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4" />
        {label}
      </div>

      <div className="flex gap-4 text-xs">
        <span className="text-emerald-400">{result.synced} synced</span>
        <span className="text-muted-foreground">{result.skipped} skipped</span>
        {result.errors.length > 0 && (
          <span className="text-red-400">{result.errors.length} errors</span>
        )}
      </div>

      {result.errors.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Show errors
          </summary>
          <ul className="mt-2 space-y-1 pl-4">
            {result.errors.map((err, i) => (
              <li key={i} className="text-red-400">
                <span className="font-medium">{err.title}:</span> {err.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function PlexSettingsPage() {
  const [movieSectionId, setMovieSectionId] = useState<string>("");
  const [tvSectionId, setTvSectionId] = useState<string>("");

  const syncStatus = trpc.media.plex.getSyncStatus.useQuery();
  const connectionTest = trpc.media.plex.testConnection.useQuery(undefined, {
    enabled: syncStatus.data?.data.configured === true,
    retry: false,
  });
  const libraries = trpc.media.plex.getLibraries.useQuery(undefined, {
    enabled: connectionTest.data?.data.connected === true,
  });

  const syncMovies = trpc.media.plex.syncMovies.useMutation({
    onSuccess: () => syncStatus.refetch(),
  });
  const syncTvShows = trpc.media.plex.syncTvShows.useMutation({
    onSuccess: () => syncStatus.refetch(),
  });

  const status = syncStatus.data?.data;
  const connected = connectionTest.data?.data.connected ?? false;
  const connectionError =
    connectionTest.data?.data && "error" in connectionTest.data.data
      ? connectionTest.data.data.error
      : undefined;
  const libraryList = libraries.data?.data ?? [];

  const movieLibraries = libraryList.filter((lib) => lib.type === "movie");
  const tvLibraries = libraryList.filter((lib) => lib.type === "show");

  const isLoading = syncStatus.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  // Not configured
  if (status && !status.configured) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            to="/media"
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Plex Settings</h1>
        </div>

        <div className="rounded-lg border bg-card p-6 text-center space-y-3">
          <Server className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">Plex not configured</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Set{" "}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
              PLEX_URL
            </code>{" "}
            and{" "}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
              PLEX_TOKEN
            </code>{" "}
            environment variables to connect your Plex Media Server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/media"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Plex Settings</h1>
        <ConnectionBadge connected={connected} />
      </div>

      {/* Connection error */}
      {connectionError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{connectionError}</span>
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
                <select
                  value={movieSectionId}
                  onChange={(e) => setMovieSectionId(e.target.value)}
                  className="w-full h-8 rounded-md border bg-background px-2 text-sm"
                  aria-label="Select movie library"
                >
                  <option value="">Select library...</option>
                  {movieLibraries.map((lib) => (
                    <option key={lib.key} value={lib.key}>
                      {lib.title}
                    </option>
                  ))}
                </select>

                <Button
                  size="sm"
                  disabled={!movieSectionId || syncMovies.isPending}
                  onClick={() =>
                    syncMovies.mutate({ sectionId: movieSectionId })
                  }
                  className="w-full"
                >
                  {syncMovies.isPending ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Sync Movies
                    </>
                  )}
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                No movie libraries found
              </p>
            )}

            {syncMovies.error && (
              <p className="text-xs text-red-400">{syncMovies.error.message}</p>
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
                <select
                  value={tvSectionId}
                  onChange={(e) => setTvSectionId(e.target.value)}
                  className="w-full h-8 rounded-md border bg-background px-2 text-sm"
                  aria-label="Select TV library"
                >
                  <option value="">Select library...</option>
                  {tvLibraries.map((lib) => (
                    <option key={lib.key} value={lib.key}>
                      {lib.title}
                    </option>
                  ))}
                </select>

                <Button
                  size="sm"
                  disabled={!tvSectionId || syncTvShows.isPending}
                  onClick={() => syncTvShows.mutate({ sectionId: tvSectionId })}
                  className="w-full"
                >
                  {syncTvShows.isPending ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Sync TV Shows
                    </>
                  )}
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                No TV libraries found
              </p>
            )}

            {syncTvShows.error && (
              <p className="text-xs text-red-400">
                {syncTvShows.error.message}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Last sync results */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Last Sync Results
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <SyncResultCard
            label="Movies"
            icon={Film}
            result={status?.lastSyncMovies ?? null}
          />
          <SyncResultCard
            label="TV Shows"
            icon={Tv}
            result={status?.lastSyncTvShows ?? null}
          />
        </div>
      </div>
    </div>
  );
}
