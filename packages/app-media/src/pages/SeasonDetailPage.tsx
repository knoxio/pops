import { useCallback, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router";
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

  // Track which episodes are currently being toggled
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());
  // Map from watch history entry ID → episode ID for delete tracking
  const deleteEntryToEpisode = useRef<Map<number, number>>(new Map());

  const utils = trpc.useUtils();

  const logMutation = trpc.media.watchHistory.log.useMutation({
    onSuccess: () => {
      void utils.media.watchHistory.list.invalidate();
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
      await utils.media.watchHistory.list.cancel();
      const previousData = utils.media.watchHistory.list.getData({
        mediaType: "episode",
        limit: 500,
      });
      // Optimistically add all episode IDs as watched
      if (previousData?.data) {
        const existingIds = new Set(previousData.data.map((e: { mediaId: number }) => e.mediaId));
        const newEntries = episodeIds
          .filter((id: number) => !existingIds.has(id))
          .map((id: number, i: number) => ({
            id: -(i + 1),
            mediaId: id,
            mediaType: "episode" as const,
            watchedAt: new Date().toISOString(),
            completed: 1,
          }));
        utils.media.watchHistory.list.setData(
          { mediaType: "episode", limit: 500 },
          { ...previousData, data: [...previousData.data, ...newEntries] }
        );
      }
      return { previousData };
    },
    onSuccess: (result) => {
      utils.media.watchHistory.invalidate();
      toast.success(
        `Marked ${result.data.logged} episode${result.data.logged !== 1 ? "s" : ""} as watched`
      );
    },
    onError: (err, _variables, context) => {
      if (context?.previousData) {
        utils.media.watchHistory.list.setData(
          { mediaType: "episode", limit: 500 },
          context.previousData
        );
      }
      toast.error(`Failed to mark season: ${err.message}`);
    },
  });

  const isSeasonWatched = seasonProgress
    ? seasonProgress.watched >= seasonProgress.total && seasonProgress.total > 0
    : false;

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
        title={seasonLabel}
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
            {season.episodeCount != null && <span>{season.episodeCount} episodes</span>}
            {season.episodeCount != null && season.airDate && <span>·</span>}
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
          />
        )}
      </section>
    </div>
  );
}
