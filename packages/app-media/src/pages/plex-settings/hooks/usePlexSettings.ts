import { useEffect, useState } from 'react';

import { useSyncJob } from '../../../hooks/useSyncJob';
import { trpc } from '../../../lib/trpc';

export function usePlexSettings() {
  const [movieSectionId, setMovieSectionId] = useState<string>('');
  const [tvSectionId, setTvSectionId] = useState<string>('');
  const [pinId, setPinId] = useState<number | null>(null);
  const [pinCode, setPinCode] = useState<string | null>(null);
  const [plexUrl, setPlexUrl] = useState<string>('');
  const [schedulerHours, setSchedulerHours] = useState<number>(6);

  // Background sync jobs
  const movieSync = useSyncJob('syncMovies');
  const tvSync = useSyncJob('syncTvShows');
  const watchlistSync = useSyncJob('syncWatchlist');
  const watchHistorySync = useSyncJob('syncWatchHistory');
  const discoverSync = useSyncJob('syncDiscoverWatches');

  // Queries
  const syncStatus = trpc.media.plex.getSyncStatus.useQuery();
  const currentUrl = trpc.media.plex.getPlexUrl.useQuery();
  const savedSectionIds = trpc.media.plex.getSectionIds.useQuery();
  const schedulerStatus = trpc.media.plex.getSchedulerStatus.useQuery();
  const syncLogs = trpc.media.plex.getSyncLogs.useQuery({ limit: 10 });

  const connectionTest = trpc.media.plex.testConnection.useQuery(undefined, {
    enabled: syncStatus.data?.data.configured === true,
    retry: false,
  });
  const libraries = trpc.media.plex.getLibraries.useQuery(undefined, {
    enabled: connectionTest.data?.data.connected === true,
  });

  // Hydrate local state from server
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

  // Derived values
  const status = syncStatus.data?.data;
  const connected = connectionTest.data?.data.connected ?? false;
  const connectionError =
    connectionTest.data?.data && 'error' in connectionTest.data.data
      ? connectionTest.data.data.error
      : undefined;
  const libraryList = libraries.data?.data ?? [];
  const movieLibraries = libraryList.filter((lib: { type: string }) => lib.type === 'movie');
  const tvLibraries = libraryList.filter((lib: { type: string }) => lib.type === 'show');
  const scheduler = schedulerStatus.data?.data;
  const isSchedulerRunning = scheduler?.isRunning ?? false;
  const isLoading = syncStatus.isLoading || currentUrl.isLoading;

  return {
    // Local state
    movieSectionId,
    setMovieSectionId,
    tvSectionId,
    setTvSectionId,
    pinId,
    setPinId,
    pinCode,
    setPinCode,
    plexUrl,
    setPlexUrl,
    schedulerHours,
    setSchedulerHours,

    // Sync jobs
    movieSync,
    tvSync,
    watchlistSync,
    watchHistorySync,
    discoverSync,

    // Queries
    syncStatus,
    connectionTest,
    currentUrl,
    schedulerStatus,
    syncLogs,

    // Derived
    status,
    connected,
    connectionError,
    movieLibraries,
    tvLibraries,
    scheduler,
    isSchedulerRunning,
    isLoading,
  };
}
