import { useCallback, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router";
import { useSetPageContext } from "@pops/navigation";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  PageHeader,
  Button,
  Switch,
  Skeleton,
} from "@pops/ui";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { EpisodeList } from "../components/EpisodeList";
import { ProgressBar } from "../components/ProgressBar";

function SeasonDetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-4 w-48" />
      <div className="flex gap-4">
        <Skeleton className="w-28 aspect-[2/3] rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export function SeasonDetailPage() {
  const { id, num } = useParams<{ id: string; num: string }>();
  const showId = Number(id);
  const seasonNum = Number(num);

  const {
    data: showData,
    isLoading: showLoading,
    error: showError,
  } = trpc.media.tvShows.get.useQuery({ id: showId }, { enabled: !Number.isNaN(showId) });

  const { data: seasonsData, isLoading: seasonsLoading } = trpc.media.tvShows.listSeasons.useQuery(
    { tvShowId: showId },
    { enabled: !Number.isNaN(showId) }
  );

  const season = seasonsData?.data?.find(
    (s: { seasonNumber: number }) => s.seasonNumber === seasonNum
  );

  const { data: episodesData, isLoading: episodesLoading } =
    trpc.media.tvShows.listEpisodes.useQuery(
      { seasonId: season?.id ?? 0 },
      { enabled: !!season?.id }
    );

  const episodes = episodesData?.data ?? [];
  const episodeIds = useMemo(() => episodes.map((ep: { id: number }) => ep.id), [episodes]);

  // Query watch history for all episodes in this season
  const { data: watchHistoryData } = trpc.media.watchHistory.list.useQuery(
    { mediaType: "episode", limit: 500 },
    { enabled: episodeIds.length > 0 }
  );

  const watchedEpisodeIds = useMemo(() => {
    if (!watchHistoryData?.data) return new Set<number>();
    const episodeIdSet = new Set<number>(episodeIds);
    return new Set<number>(
      watchHistoryData.data
        .filter((entry: { mediaId: number }) => episodeIdSet.has(entry.mediaId))
        .map((entry: { mediaId: number }) => entry.mediaId)
    );
  }, [watchHistoryData, episodeIds]);

  // Sonarr monitoring state
  const tvdbId = showData?.data?.tvdbId;

  const { data: sonarrData } = trpc.media.arr.checkSeries.useQuery(
    { tvdbId: tvdbId ?? 0 },
    { enabled: !!tvdbId }
  );

  const sonarrSeries = sonarrData?.data;

  const sonarrSeasonData = sonarrSeries?.seasons?.find(
    (s: { seasonNumber: number }) => s.seasonNumber === seasonNum
  );
  const [seasonMonitored, setSeasonMonitored] = useState<boolean | null>(null);
  const effectiveMonitored = seasonMonitored ?? sonarrSeasonData?.monitored ?? false;

  const seasonMonitorMutation = trpc.media.arr.updateSeasonMonitoring.useMutation({
    onError: (err: { message: string }) => {
      setSeasonMonitored((prev) => (prev != null ? !prev : null));
      toast.error(`Failed to update monitoring: ${err.message}`);
    },
  });

  // Sonarr episode data — monitoring + hasFile per episode
  const sonarrId = sonarrSeries?.sonarrId;
  const { data: sonarrEpisodesData } = trpc.media.arr.getSeriesEpisodes.useQuery(
    { sonarrId: sonarrId ?? 0, seasonNumber: seasonNum },
    { enabled: !!sonarrId }
  );

  const sonarrEpisodes = sonarrEpisodesData?.data ?? [];

  // Build maps from episode number → monitoring/hasFile state
  const [optimisticEpMonitoring, setOptimisticEpMonitoring] = useState<Map<number, boolean>>(
    new Map()
  );
  const [pendingEpMonitoring, setPendingEpMonitoring] = useState<Set<number>>(new Set());

  const monitoredMap = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const ep of sonarrEpisodes) {
      m.set(ep.episodeNumber, optimisticEpMonitoring.get(ep.episodeNumber) ?? ep.monitored);
    }
    return m;
  }, [sonarrEpisodes, optimisticEpMonitoring]);

  const hasFileMap = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const ep of sonarrEpisodes) {
      m.set(ep.episodeNumber, ep.hasFile);
    }
    return m;
  }, [sonarrEpisodes]);

  // Map episode number → sonarr episode ID for mutations
  const epNumToSonarrId = useMemo(() => {
    const m = new Map<number, number>();
    for (const ep of sonarrEpisodes) {
      m.set(ep.episodeNumber, ep.id);
    }
    return m;
  }, [sonarrEpisodes]);

  const episodeMonitorMutation = trpc.media.arr.updateEpisodeMonitoring.useMutation({
    onSuccess: () => {
      void utils.media.arr.getSeriesEpisodes.invalidate();
    },
    onError: (
      err: { message: string },
      variables: { episodeIds: number[]; monitored: boolean }
    ) => {
      // Rollback optimistic state for affected episodes
      setOptimisticEpMonitoring((prev) => {
        const next = new Map(prev);
        const affectedIds = new Set(variables.episodeIds);
        for (const ep of sonarrEpisodes) {
          if (affectedIds.has(ep.id)) {
            next.set(ep.episodeNumber, !variables.monitored);
          }
        }
        return next;
      });
      toast.error(`Failed to update monitoring: ${err.message}`);
    },
    onSettled: (_data: unknown, _err: unknown, variables: { episodeIds: number[] }) => {
      setPendingEpMonitoring((prev) => {
        const next = new Set(prev);
        const affectedIds = new Set(variables.episodeIds);
        for (const ep of sonarrEpisodes) {
          if (affectedIds.has(ep.id)) {
            next.delete(ep.episodeNumber);
          }
        }
        return next;
      });
    },
  });

  const handleToggleEpMonitored = useCallback(
    (episodeNumber: number, monitored: boolean) => {
      const sonarrEpId = epNumToSonarrId.get(episodeNumber);
      if (sonarrEpId == null) return;

      setOptimisticEpMonitoring((prev) => {
        const next = new Map(prev);
        next.set(episodeNumber, monitored);
        return next;
      });
      setPendingEpMonitoring((prev) => new Set(prev).add(episodeNumber));

      episodeMonitorMutation.mutate({
        episodeIds: [sonarrEpId],
        monitored,
      });
    },
    [episodeMonitorMutation, epNumToSonarrId]
  );

  // Batch monitor/unmonitor all episodes in season
  const allEpisodesMonitored =
    sonarrEpisodes.length > 0 &&
    sonarrEpisodes.every((ep) => monitoredMap.get(ep.episodeNumber) ?? ep.monitored);

  const handleBatchMonitorToggle = useCallback(() => {
    const newMonitored = !allEpisodesMonitored;
    const ids = sonarrEpisodes.map((ep) => ep.id);
    if (ids.length === 0) return;

    // Optimistically update all
    setOptimisticEpMonitoring((prev) => {
      const next = new Map(prev);
      for (const ep of sonarrEpisodes) {
        next.set(ep.episodeNumber, newMonitored);
      }
      return next;
    });
    setPendingEpMonitoring((prev) => {
      const next = new Set(prev);
      for (const ep of sonarrEpisodes) {
        next.add(ep.episodeNumber);
      }
      return next;
    });

    episodeMonitorMutation.mutate({
      episodeIds: ids,
      monitored: newMonitored,
    });
  }, [allEpisodesMonitored, sonarrEpisodes, episodeMonitorMutation]);

  // Track which episodes are currently being toggled
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());
  // Map from watch history entry ID → episode ID for delete tracking
  const deleteEntryToEpisode = useRef<Map<number, number>>(new Map());

  const utils = trpc.useUtils();

  // Snapshot refs for optimistic rollback (avoids mutation context typing issues)
  const progressSnapshot =
    useRef<ReturnType<typeof utils.media.watchHistory.progress.getData>>(undefined);
  const listSnapshot = useRef<ReturnType<typeof utils.media.watchHistory.list.getData>>(undefined);

  const logMutation = trpc.media.watchHistory.log.useMutation({
    onSuccess: () => {
      void utils.media.watchHistory.list.invalidate();
      void utils.media.watchHistory.progress.invalidate();
      void utils.media.tvShows.listSeasons.invalidate();
    },
    onError: (err: { message: string }) => {
      toast.error(`Failed to log watch: ${err.message}`);
    },
    onSettled: (_data: unknown, _err: unknown, variables: { mediaId: number }) => {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(variables.mediaId);
        return next;
      });
    },
  });

  const deleteMutation = trpc.media.watchHistory.delete.useMutation({
    onSuccess: () => {
      void utils.media.watchHistory.list.invalidate();
      void utils.media.watchHistory.progress.invalidate();
      void utils.media.tvShows.listSeasons.invalidate();
    },
    onError: (err: { message: string }) => {
      toast.error(`Failed to remove watch: ${err.message}`);
    },
    onSettled: (_data: unknown, _err: unknown, variables: { id: number }) => {
      const episodeId = deleteEntryToEpisode.current.get(variables.id);
      deleteEntryToEpisode.current.delete(variables.id);
      if (episodeId != null) {
        setTogglingIds((prev) => {
          const next = new Set(prev);
          next.delete(episodeId);
          return next;
        });
      }
    },
  });

  const handleToggleWatched = useCallback(
    (episodeId: number, watched: boolean) => {
      setTogglingIds((prev) => new Set(prev).add(episodeId));

      if (watched) {
        logMutation.mutate({ mediaType: "episode", mediaId: episodeId });
      } else {
        // Find the watch history entry to delete
        const entry = watchHistoryData?.data?.find(
          (e: { mediaId: number; id: number }) => e.mediaId === episodeId
        );
        if (entry) {
          deleteEntryToEpisode.current.set(entry.id, episodeId);
          deleteMutation.mutate({ id: entry.id });
        } else {
          setTogglingIds((prev) => {
            const next = new Set(prev);
            next.delete(episodeId);
            return next;
          });
        }
      }
    },
    [logMutation, deleteMutation, watchHistoryData]
  );

  const { data: progressData } = trpc.media.watchHistory.progress.useQuery(
    { tvShowId: showId },
    { enabled: !Number.isNaN(showId) }
  );

  const seasonProgress = progressData?.data?.seasons?.find(
    (s: { seasonNumber: number }) => s.seasonNumber === seasonNum
  );

  const batchLogMutation = trpc.media.watchHistory.batchLog.useMutation({
    onMutate: async () => {
      await utils.media.watchHistory.progress.cancel({ tvShowId: showId });
      await utils.media.watchHistory.list.cancel();
      progressSnapshot.current = utils.media.watchHistory.progress.getData({ tvShowId: showId });
      listSnapshot.current = utils.media.watchHistory.list.getData({
        mediaType: "episode",
        limit: 500,
      });

      // Optimistically set season progress to 100%
      utils.media.watchHistory.progress.setData({ tvShowId: showId }, (old) => {
        if (!old?.data) return old;
        const updatedSeasons = old.data.seasons.map((s) =>
          s.seasonNumber === seasonNum ? { ...s, watched: s.total, percentage: 100 } : s
        );
        const totalWatched = updatedSeasons.reduce((sum, s) => sum + s.watched, 0);
        const totalEpisodes = updatedSeasons.reduce((sum, s) => sum + s.total, 0);
        return {
          ...old,
          data: {
            ...old.data,
            seasons: updatedSeasons,
            overall: {
              watched: totalWatched,
              total: totalEpisodes,
              percentage: totalEpisodes > 0 ? Math.round((totalWatched / totalEpisodes) * 100) : 0,
            },
          },
        };
      });

      // Optimistically add all unwatched episodes to watch history
      if (episodes.length > 0) {
        utils.media.watchHistory.list.setData({ mediaType: "episode", limit: 500 }, (old) => {
          if (!old?.data) return old;
          const existingIds = new Set(old.data.map((e: { mediaId: number }) => e.mediaId));
          const newEntries = episodes
            .filter((ep: { id: number }) => !existingIds.has(ep.id))
            .map((ep: { id: number }) => ({
              id: -ep.id,
              mediaType: "episode" as const,
              mediaId: ep.id,
              watchedAt: new Date().toISOString(),
              completed: 1,
            }));
          return { ...old, data: [...old.data, ...newEntries] };
        });
      }
    },
    onSuccess: (result: { data: { logged: number } }) => {
      toast.success(
        `Marked ${result.data.logged} episode${result.data.logged !== 1 ? "s" : ""} as watched`
      );
    },
    onError: (err: { message: string }) => {
      if (progressSnapshot.current !== undefined) {
        utils.media.watchHistory.progress.setData({ tvShowId: showId }, progressSnapshot.current);
      }
      if (listSnapshot.current !== undefined) {
        utils.media.watchHistory.list.setData(
          { mediaType: "episode", limit: 500 },
          listSnapshot.current
        );
      }
      toast.error(`Failed to mark season: ${err.message}`);
    },
    onSettled: () => {
      void utils.media.watchHistory.invalidate();
      void utils.media.tvShows.listSeasons.invalidate();
    },
  });

  const isSeasonWatched = seasonProgress
    ? seasonProgress.watched >= seasonProgress.total && seasonProgress.total > 0
    : false;

  const seasonEntity = useMemo(
    () => ({
      uri: `pops:media/tv/${showId}/season/${seasonNum}`,
      type: "season" as const,
      title: showData?.data?.name ?? "",
    }),
    [showId, seasonNum, showData?.data?.name]
  );
  useSetPageContext({ page: "season-detail", pageType: "drill-down", entity: seasonEntity });

  if (Number.isNaN(showId) || Number.isNaN(seasonNum)) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Invalid parameters</AlertTitle>
          <AlertDescription>Show ID and season number must be valid numbers.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (showLoading || seasonsLoading) {
    return <SeasonDetailSkeleton />;
  }

  if (showError) {
    const is404 = showError.data?.code === "NOT_FOUND";
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>{is404 ? "Show not found" : "Error"}</AlertTitle>
          <AlertDescription>
            {is404 ? "This TV show doesn't exist in your library." : showError.message}
          </AlertDescription>
        </Alert>
        <Link to="/media" className="mt-4 inline-block text-sm text-primary underline">
          Back to library
        </Link>
      </div>
    );
  }

  const show = showData?.data;
  if (!show) return null;

  if (!season) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Season not found</AlertTitle>
          <AlertDescription>
            Season {seasonNum} doesn't exist for {show.name}.
          </AlertDescription>
        </Alert>
        <Link
          to={`/media/tv/${show.id}`}
          className="mt-4 inline-block text-sm text-primary underline"
        >
          Back to {show.name}
        </Link>
      </div>
    );
  }

  const seasonLabel = seasonNum === 0 ? "Specials" : `Season ${seasonNum}`;
  const posterSrc = season.posterUrl ?? null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title={show.name}
        backHref={`/media/tv/${show.id}`}
        breadcrumbs={[
          { label: "Media", href: "/media" },
          { label: show.name, href: `/media/tv/${show.id}` },
          { label: seasonLabel },
        ]}
        renderLink={Link}
      />

      {/* Season header */}
      <div className="flex flex-col sm:flex-row gap-4">
        {posterSrc && (
          <img
            src={posterSrc}
            alt={`${seasonLabel} poster`}
            className="w-28 aspect-[2/3] rounded-lg object-cover shadow-md shrink-0"
          />
        )}

        <div className="flex-1">
          <h1 className="text-2xl font-bold">{season.name ?? seasonLabel}</h1>

          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            {episodes.length > 0 && <span>{episodes.length} episodes</span>}
            {episodes.length > 0 && season.airDate && <span>·</span>}
            {season.airDate && <span>First aired {season.airDate}</span>}
          </div>

          {season.overview && (
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{season.overview}</p>
          )}

          {seasonProgress && seasonProgress.total > 0 && (
            <div className="mt-3">
              <ProgressBar watched={seasonProgress.watched} total={seasonProgress.total} />
            </div>
          )}

          {sonarrSeries?.exists &&
            sonarrSeries.sonarrId != null &&
            (() => {
              const sonarrId = sonarrSeries.sonarrId;
              return (
                <div className="flex items-center gap-2 mt-3">
                  <Switch
                    size="sm"
                    checked={effectiveMonitored}
                    aria-label={`Monitor ${seasonLabel}`}
                    disabled={seasonMonitorMutation.isPending}
                    onCheckedChange={(checked: boolean) => {
                      setSeasonMonitored(checked);
                      seasonMonitorMutation.mutate({
                        sonarrId,
                        seasonNumber: seasonNum,
                        monitored: checked,
                      });
                    }}
                  />
                  <span className="text-sm text-muted-foreground">
                    {effectiveMonitored ? "Monitored" : "Unmonitored"}
                  </span>
                </div>
              );
            })()}

          {sonarrSeries?.exists && sonarrEpisodes.length > 0 && (
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchMonitorToggle}
                disabled={episodeMonitorMutation.isPending}
              >
                {allEpisodesMonitored ? "Unmonitor All" : "Monitor All"}
              </Button>
            </div>
          )}

          {season?.id && (
            <div className="flex gap-2 mt-3">
              {!isSeasonWatched ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    batchLogMutation.mutate({
                      mediaType: "season",
                      mediaId: season.id,
                    })
                  }
                  disabled={batchLogMutation.isPending}
                >
                  Mark Season Watched
                </Button>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-green-500 font-medium">
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  All Watched
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Episode list */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Episodes</h2>
        {episodesLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <EpisodeList
            episodes={episodes}
            watchedEpisodeIds={watchedEpisodeIds}
            onToggleWatched={handleToggleWatched}
            togglingIds={togglingIds}
            monitoredMap={sonarrSeries?.exists ? monitoredMap : undefined}
            hasFileMap={sonarrSeries?.exists ? hasFileMap : undefined}
            onToggleMonitored={sonarrSeries?.exists ? handleToggleEpMonitored : undefined}
            monitoringPendingIds={pendingEpMonitoring}
          />
        )}
      </section>
    </div>
  );
}
