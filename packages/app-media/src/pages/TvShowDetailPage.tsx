import { useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  Badge,
  Button,
  Skeleton,
  Switch,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@pops/ui";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { formatYearRange } from "../lib/format";
import { ProgressBar } from "../components/ProgressBar";
import { ArrStatusBadge } from "../components/ArrStatusBadge";

function TvShowDetailSkeleton() {
  return (
    <div>
      <div className="relative h-64 md:h-96 bg-muted">
        <div className="absolute inset-0 flex items-end p-6 gap-6">
          <Skeleton className="w-32 md:w-48 aspect-[2/3] rounded-lg shrink-0" />
          <div className="flex-1 space-y-3 pb-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
      <div className="p-6 space-y-6">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TvShowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const showId = Number(id);

  const { data, isLoading, error } = trpc.media.tvShows.get.useQuery(
    { id: showId },
    { enabled: !Number.isNaN(showId) }
  );

  const { data: seasonsData } = trpc.media.tvShows.listSeasons.useQuery(
    { tvShowId: showId },
    { enabled: !Number.isNaN(showId) }
  );

  const { data: progressData } = trpc.media.watchHistory.progress.useQuery(
    { tvShowId: showId },
    { enabled: !Number.isNaN(showId) }
  );

  const { data: sonarrData } = trpc.media.arr.checkSeries.useQuery(
    { tvdbId: data?.data?.tvdbId ?? 0 },
    { enabled: !!data?.data?.tvdbId }
  );

  const sonarrSeries = sonarrData?.data;

  const [optimisticMonitoring, setOptimisticMonitoring] = useState<Map<number, boolean>>(new Map());
  const [pendingSeasons, setPendingSeasons] = useState<Set<number>>(new Set());

  const utils = trpc.useUtils();

  const progressSnapshot =
    useRef<ReturnType<typeof utils.media.watchHistory.progress.getData>>(undefined);

  const seasonMonitorMutation = trpc.media.arr.updateSeasonMonitoring.useMutation({
    onError: (
      err: { message: string },
      variables: { seasonNumber: number; monitored: boolean }
    ) => {
      setOptimisticMonitoring((prev) => {
        const next = new Map(prev);
        next.set(variables.seasonNumber, !variables.monitored);
        return next;
      });
      toast.error(`Failed to update monitoring: ${err.message}`);
    },
    onSuccess: () => {
      void utils.media.arr.checkSeries.invalidate();
    },
    onSettled: (_data: unknown, _err: unknown, variables: { seasonNumber: number }) => {
      setPendingSeasons((prev) => {
        const next = new Set(prev);
        next.delete(variables.seasonNumber);
        return next;
      });
    },
  });

  const batchLogMutation = trpc.media.watchHistory.batchLog.useMutation({
    onMutate: async () => {
      await utils.media.watchHistory.progress.cancel({ tvShowId: showId });
      progressSnapshot.current = utils.media.watchHistory.progress.getData({ tvShowId: showId });

      // Optimistically set all seasons to 100%
      utils.media.watchHistory.progress.setData({ tvShowId: showId }, (old) => {
        if (!old?.data) return old;
        const updatedSeasons = old.data.seasons.map((s) => ({
          ...s,
          watched: s.total,
          percentage: 100,
        }));
        const totalEpisodes = updatedSeasons.reduce((sum, s) => sum + s.total, 0);
        return {
          ...old,
          data: {
            ...old.data,
            seasons: updatedSeasons,
            overall: {
              watched: totalEpisodes,
              total: totalEpisodes,
              percentage: 100,
            },
            nextEpisode: null,
          },
        };
      });
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
      toast.error(`Failed to mark all watched: ${err.message}`);
    },
    onSettled: () => {
      void utils.media.watchHistory.invalidate();
      void utils.media.tvShows.listSeasons.invalidate();
    },
  });

  const rawSeasons = seasonsData?.data ?? [];
  // Sort seasons ascending by number, specials (season 0) last
  const seasons = useMemo(
    () =>
      [...rawSeasons].sort((a: { seasonNumber: number }, b: { seasonNumber: number }) => {
        if (a.seasonNumber === 0) return 1;
        if (b.seasonNumber === 0) return -1;
        return a.seasonNumber - b.seasonNumber;
      }),
    [rawSeasons]
  );

  if (Number.isNaN(showId)) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Invalid show ID</AlertTitle>
          <AlertDescription>The show ID must be a number.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return <TvShowDetailSkeleton />;
  }

  if (error) {
    const is404 = error.data?.code === "NOT_FOUND";
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>{is404 ? "Show not found" : "Error"}</AlertTitle>
          <AlertDescription>
            {is404 ? "This TV show doesn't exist in your library." : error.message}
          </AlertDescription>
        </Alert>
        <Link to="/media" className="mt-4 inline-block text-sm text-primary underline">
          Back to library
        </Link>
      </div>
    );
  }

  const show = data?.data;
  if (!show) return null;

  const yearRange = formatYearRange(show.firstAirDate, show.lastAirDate, show.status);

  const posterSrc = show.posterUrl ?? undefined;
  const backdropSrc = show.backdropUrl ?? null;

  const progress = progressData?.data;

  const nextEpisode = progress?.nextEpisode ?? null;

  const metadataItems = [
    { label: "Status", value: show.status },
    { label: "Language", value: show.originalLanguage?.toUpperCase() },
    {
      label: "Networks",
      value: show.networks && show.networks.length > 0 ? show.networks.join(", ") : null,
    },
    {
      label: "TMDB Rating",
      value: show.voteAverage ? `${show.voteAverage.toFixed(1)} (${show.voteCount} votes)` : null,
    },
    {
      label: "Seasons",
      value: seasons.length > 0 ? `${seasons.length}` : null,
    },
  ].filter((item) => item.value != null);

  return (
    <div>
      {/* Hero section — negative margins cancel shell padding for edge-to-edge */}
      <div className="-mx-4 md:-mx-6 lg:-mx-8 -mt-4 md:-mt-6 lg:-mt-8 relative h-64 md:h-96 overflow-hidden bg-muted">
        {backdropSrc && (
          <img src={backdropSrc} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/20" />

        {/* Breadcrumb overlay */}
        <div className="absolute top-0 left-0 right-0 p-4 md:p-6 z-10">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/media" className="text-white/70 hover:text-white">
                    Media
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="text-white/50" />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-white/90">{show.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="relative h-full flex flex-col md:flex-row items-end p-6 gap-4 md:gap-6">
          {posterSrc ? (
            <img
              src={posterSrc}
              alt={`${show.name} poster`}
              className="w-28 md:w-44 aspect-[2/3] rounded-lg object-cover shadow-lg shrink-0"
            />
          ) : (
            <div className="w-28 md:w-44 aspect-[2/3] rounded-lg bg-muted shadow-lg shrink-0" />
          )}

          <div className="flex-1 pb-1">
            <h1 className="text-2xl md:text-4xl font-bold text-foreground">{show.name}</h1>

            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              {yearRange && <span>{yearRange}</span>}
              {show.status && (
                <>
                  {yearRange && <span>·</span>}
                  <span>{show.status}</span>
                </>
              )}
              <ArrStatusBadge kind="show" externalId={show.tvdbId} />
            </div>

            {/* Overall progress */}
            {progress && progress.overall.total > 0 && (
              <div className="mt-3 max-w-xs">
                <ProgressBar watched={progress.overall.watched} total={progress.overall.total} />
              </div>
            )}

            {/* Next episode indicator */}
            {nextEpisode && (
              <Link
                to={`/media/tv/${show.id}/season/${nextEpisode.seasonNumber}`}
                className="inline-block mt-2 text-sm text-primary hover:underline"
              >
                Continue watching: S{String(nextEpisode.seasonNumber).padStart(2, "0")}E
                {String(nextEpisode.episodeNumber).padStart(2, "0")}
                {nextEpisode.episodeName ? ` — ${nextEpisode.episodeName}` : ""}
              </Link>
            )}

            {/* Batch watch button */}
            {progress && progress.overall.total > 0 && (
              <div className="mt-3">
                {progress.overall.watched < progress.overall.total ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      batchLogMutation.mutate({
                        mediaType: "show",
                        mediaId: showId,
                      })
                    }
                    disabled={batchLogMutation.isPending}
                  >
                    Mark All Watched
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
      </div>

      {/* Content below hero */}
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Overview */}
        {show.overview && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Overview</h2>
            <p className="text-muted-foreground leading-relaxed">{show.overview}</p>
          </section>
        )}

        {/* Genre tags */}
        {show.genres && show.genres.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Genres</h2>
            <div className="flex flex-wrap gap-2">
              {show.genres.map((genre: string) => (
                <Badge key={genre} variant="secondary">
                  {genre}
                </Badge>
              ))}
            </div>
          </section>
        )}

        {/* Metadata grid */}
        {metadataItems.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Details</h2>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {metadataItems.map((item) => (
                <div key={item.label}>
                  <dt className="text-sm text-muted-foreground">{item.label}</dt>
                  <dd className="text-sm font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* Seasons list with progress */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Seasons</h2>
          {seasons.length === 0 ? (
            <p className="text-muted-foreground">No seasons available</p>
          ) : (
            <div className="space-y-2">
              {seasons.map(
                (season: {
                  id: number;
                  seasonNumber: number;
                  name: string | null;
                  episodeCount: number | null;
                }) => {
                  const seasonProg = progress?.seasons?.find(
                    (s: { seasonNumber: number }) => s.seasonNumber === season.seasonNumber
                  );
                  const label =
                    season.seasonNumber === 0
                      ? "Specials"
                      : (season.name ?? `Season ${season.seasonNumber}`);

                  const sonarrSeason = sonarrSeries?.seasons?.find(
                    (s: { seasonNumber: number }) => s.seasonNumber === season.seasonNumber
                  );
                  const isMonitored =
                    optimisticMonitoring.get(season.seasonNumber) ??
                    sonarrSeason?.monitored ??
                    false;

                  return (
                    <div
                      key={season.id}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                    >
                      <Link
                        to={`/media/tv/${show.id}/season/${season.seasonNumber}`}
                        className="flex items-center gap-3 flex-1 min-w-0"
                      >
                        <span className="text-sm font-medium flex-1">{label}</span>
                        {season.episodeCount != null && (
                          <span className="text-xs text-muted-foreground">
                            {season.episodeCount} episodes
                          </span>
                        )}
                        {seasonProg && seasonProg.total > 0 && (
                          <div className="w-24">
                            <ProgressBar
                              watched={seasonProg.watched}
                              total={seasonProg.total}
                              showLabel={false}
                            />
                          </div>
                        )}
                      </Link>
                      {sonarrSeries?.exists &&
                        sonarrSeries.sonarrId != null &&
                        (() => {
                          const sonarrId = sonarrSeries.sonarrId;
                          return (
                            <Switch
                              size="sm"
                              checked={isMonitored}
                              aria-label={`Monitor ${label}`}
                              disabled={pendingSeasons.has(season.seasonNumber)}
                              onCheckedChange={(checked: boolean) => {
                                setOptimisticMonitoring((prev) => {
                                  const next = new Map(prev);
                                  next.set(season.seasonNumber, checked);
                                  return next;
                                });
                                setPendingSeasons((prev) => {
                                  const next = new Set(prev);
                                  next.add(season.seasonNumber);
                                  return next;
                                });
                                seasonMonitorMutation.mutate({
                                  sonarrId,
                                  seasonNumber: season.seasonNumber,
                                  monitored: checked,
                                });
                              }}
                            />
                          );
                        })()}
                    </div>
                  );
                }
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
