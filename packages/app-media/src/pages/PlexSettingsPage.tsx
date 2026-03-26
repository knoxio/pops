/**
 * PlexSettingsPage — Plex Media Server connection status and sync controls.
 *
 * Shows connection health, available libraries, and sync buttons
 * for importing movies and TV shows from Plex into the local library.
 */
import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  Badge,
  Button,
  Skeleton,
  Input,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@pops/ui";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Film,
  Tv,
  AlertTriangle,
  Server,
  Save,
} from "lucide-react";
import { toast } from "sonner";
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

export function PlexSettingsPage() {
  const [movieSectionId, setMovieSectionId] = useState<string>("");
  const [tvSectionId, setTvSectionId] = useState<string>("");
  const [pinId, setPinId] = useState<number | null>(null);
  const [plexUrl, setPlexUrl] = useState<string>("");

  const syncStatus = trpc.media.plex.getSyncStatus.useQuery();
  const currentUrl = trpc.media.plex.getPlexUrl.useQuery();
  const savedSectionIds = trpc.media.plex.getSectionIds.useQuery();

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

  const connectionTest = trpc.media.plex.testConnection.useQuery(undefined, {
    enabled: syncStatus.data?.data.configured === true,
    retry: false,
  });
  const libraries = trpc.media.plex.getLibraries.useQuery(undefined, {
    enabled: connectionTest.data?.data.connected === true,
  });

  const syncMovies = trpc.media.plex.syncMovies.useMutation({
    onSuccess: () => {
      toast.success("Movie sync complete");
      syncStatus.refetch();
    },
    onError: (err) => toast.error(`Movie sync failed: ${err.message}`),
  });
  const syncTvShows = trpc.media.plex.syncTvShows.useMutation({
    onSuccess: () => {
      toast.success("TV show sync complete");
      syncStatus.refetch();
    },
    onError: (err) => toast.error(`TV show sync failed: ${err.message}`),
  });
  const saveSectionIds = trpc.media.plex.saveSectionIds.useMutation({
    onError: (err) => toast.error(`Failed to save library selection: ${err.message}`),
  });

  const saveUrl = trpc.media.plex.setUrl.useMutation({
    onSuccess: () => {
      toast.success("Server URL saved");
      syncStatus.refetch();
      connectionTest.refetch();
      currentUrl.refetch();
    },
    onError: (err) => {
      toast.error(`Failed to save URL: ${err.message}`);
    },
  });

  const getPin = trpc.media.plex.getAuthPin.useMutation({
    onSuccess: (res) => {
      const { id, code, clientId } = res.data;
      setPinId(id);
      window.open(
        `https://app.plex.tv/auth#?clientID=${clientId}&code=${code}&context[device][product]=POPS`,
        "_blank"
      );
    },
    onError: (err) => {
      toast.error(`Failed to start auth: ${err.message}`);
    },
  });

  const checkPin = trpc.media.plex.checkAuthPin.useMutation({
    onSuccess: (res) => {
      if (res.data.connected) {
        toast.success("Plex account connected");
        setPinId(null);
        syncStatus.refetch();
        connectionTest.refetch();
      }
    },
    onError: (err) => {
      toast.error(`Auth check failed: ${err.message}`);
    },
  });

  const disconnect = trpc.media.plex.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Plex account disconnected");
      syncStatus.refetch();
      connectionTest.refetch();
    },
    onError: (err) => toast.error(`Failed to disconnect: ${err.message}`),
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

  const movieLibraries = libraryList.filter((lib) => lib.type === "movie");
  const tvLibraries = libraryList.filter((lib) => lib.type === "show");

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
              {pinId ? (
                <div className="space-y-3">
                  <p className="text-sm text-amber-400 animate-pulse">
                    Waiting for authentication in new tab...
                  </p>
                  <Button variant="outline" onClick={() => setPinId(null)}>
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
                  <select
                    value={movieSectionId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setMovieSectionId(id);
                      if (id) saveSectionIds.mutate({ movieSectionId: id });
                    }}
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
                    onClick={() => syncMovies.mutate({ sectionId: movieSectionId })}
                    className="w-full"
                  >
                    {syncMovies.isPending ? (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {syncMovies.isPending ? "Syncing..." : "Sync Movies"}
                  </Button>
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
                  <select
                    value={tvSectionId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setTvSectionId(id);
                      if (id) saveSectionIds.mutate({ tvSectionId: id });
                    }}
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
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {syncTvShows.isPending ? "Syncing..." : "Sync TV Shows"}
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No TV libraries found</p>
              )}
            </div>
          </div>
        )}

        {/* Sync results are shown via toast notifications on sync completion */}
      </div>
    </div>
  );
}
