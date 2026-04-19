import { useMemo } from 'react';
import { Link, useParams } from 'react-router';

import { trpc } from '@pops/api-client';
import { useSetPageContext } from '@pops/navigation';
import { PageHeader, Skeleton } from '@pops/ui';

import { EpisodeList } from '../components/EpisodeList';
import {
  InvalidParamsError,
  SeasonNotFoundError,
  ShowError,
} from './season-detail/SeasonDetailErrors';
import { SeasonDetailSkeleton } from './season-detail/SeasonDetailSkeleton';
import { SeasonHeader } from './season-detail/SeasonHeader';
import { useEpisodeWatchState } from './season-detail/useEpisodeWatchState';
import { useSonarrMonitoring } from './season-detail/useSonarrMonitoring';

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

  const { data: watchHistoryData } = trpc.media.watchHistory.list.useQuery(
    { mediaType: 'episode', limit: 500 },
    { enabled: episodeIds.length > 0 }
  );

  const { data: progressData } = trpc.media.watchHistory.progress.useQuery(
    { tvShowId: showId },
    { enabled: !Number.isNaN(showId) }
  );

  const seasonProgress = progressData?.data?.seasons?.find(
    (s: { seasonNumber: number }) => s.seasonNumber === seasonNum
  );
  const isSeasonWatched = seasonProgress
    ? seasonProgress.watched >= seasonProgress.total && seasonProgress.total > 0
    : false;

  const sonarr = useSonarrMonitoring({ tvdbId: showData?.data?.tvdbId, seasonNum });

  const watch = useEpisodeWatchState({
    showId,
    seasonNum,
    season,
    episodes,
    watchHistory: watchHistoryData?.data,
  });

  const showName = showData?.data?.name ?? '';
  const seasonEntity = useMemo(
    () => ({
      uri: `pops:media/tv/${showId}/season/${seasonNum}`,
      type: 'season' as const,
      title: showName,
    }),
    [showId, seasonNum, showName]
  );
  useSetPageContext({ page: 'season-detail', pageType: 'drill-down', entity: seasonEntity });

  if (Number.isNaN(showId) || Number.isNaN(seasonNum)) return <InvalidParamsError />;
  if (showLoading || seasonsLoading) return <SeasonDetailSkeleton />;
  if (showError) {
    return <ShowError is404={showError.data?.code === 'NOT_FOUND'} message={showError.message} />;
  }

  const show = showData?.data;
  if (!show) return null;
  if (!season) {
    return <SeasonNotFoundError showId={show.id} showName={show.name} seasonNum={seasonNum} />;
  }

  const seasonLabel = seasonNum === 0 ? 'Specials' : `Season ${seasonNum}`;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title={show.name}
        backHref={`/media/tv/${show.id}`}
        breadcrumbs={[
          { label: 'Media', href: '/media' },
          { label: show.name, href: `/media/tv/${show.id}` },
          { label: seasonLabel },
        ]}
        renderLink={Link}
      />

      <SeasonHeader
        season={season}
        seasonLabel={seasonLabel}
        episodeCount={episodes.length}
        seasonProgress={seasonProgress}
        sonarrSeries={sonarr.sonarrSeries}
        hasSonarrEpisodes={sonarr.sonarrEpisodes.length > 0}
        effectiveMonitored={sonarr.effectiveMonitored}
        seasonMonitorPending={sonarr.seasonMonitorPending}
        episodeMonitorPending={sonarr.episodeMonitorPending}
        allEpisodesMonitored={sonarr.allEpisodesMonitored}
        onSeasonToggle={sonarr.handleSeasonMonitorToggle}
        onBatchEpisodeToggle={sonarr.handleBatchMonitorToggle}
        isSeasonWatched={isSeasonWatched}
        batchLogPending={watch.batchLogPending}
        onMarkSeasonWatched={watch.handleBatchMarkWatched}
      />

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
            watchedEpisodeIds={watch.watchedEpisodeIds}
            onToggleWatched={watch.handleToggleWatched}
            togglingIds={watch.togglingIds}
            monitoredMap={sonarr.sonarrSeries?.exists ? sonarr.monitoredMap : undefined}
            hasFileMap={sonarr.sonarrSeries?.exists ? sonarr.hasFileMap : undefined}
            onToggleMonitored={
              sonarr.sonarrSeries?.exists ? sonarr.handleToggleEpMonitored : undefined
            }
            monitoringPendingIds={sonarr.pendingEpMonitoring}
          />
        )}
      </section>
    </div>
  );
}
