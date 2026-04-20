import { Link, useParams } from 'react-router';

import { PageHeader, Skeleton } from '@pops/ui';

import { EpisodeList } from '../components/EpisodeList';
import {
  InvalidParamsError,
  SeasonNotFoundError,
  ShowError,
} from './season-detail/SeasonDetailErrors';
import { SeasonDetailSkeleton } from './season-detail/SeasonDetailSkeleton';
import { SeasonHeader } from './season-detail/SeasonHeader';
import { useSeasonDetailModel } from './season-detail/useSeasonDetailModel';

function EpisodesSection({
  episodesLoading,
  episodes,
  watch,
  sonarr,
}: {
  episodesLoading: boolean;
  episodes: {
    id: number;
    episodeNumber: number;
    name: string | null;
    overview: string | null;
    airDate: string | null;
    runtime: number | null;
  }[];
  watch: ReturnType<typeof useSeasonDetailModel>['watch'];
  sonarr: ReturnType<typeof useSeasonDetailModel>['sonarr'];
}) {
  return (
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
  );
}

export function SeasonDetailPage() {
  const { id, num } = useParams<{ id: string; num: string }>();
  const showId = Number(id);
  const seasonNum = Number(num);

  const m = useSeasonDetailModel(showId, seasonNum);

  if (Number.isNaN(showId) || Number.isNaN(seasonNum)) return <InvalidParamsError />;
  if (m.showLoading || m.seasonsLoading) return <SeasonDetailSkeleton />;
  if (m.showError) {
    return (
      <ShowError is404={m.showError.data?.code === 'NOT_FOUND'} message={m.showError.message} />
    );
  }

  const show = m.show;
  if (!show) return null;
  if (!m.season) {
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
        season={m.season}
        seasonLabel={seasonLabel}
        episodeCount={m.episodes.length}
        seasonProgress={m.seasonProgress}
        sonarrSeries={m.sonarr.sonarrSeries}
        hasSonarrEpisodes={m.sonarr.sonarrEpisodes.length > 0}
        effectiveMonitored={m.sonarr.effectiveMonitored}
        seasonMonitorPending={m.sonarr.seasonMonitorPending}
        episodeMonitorPending={m.sonarr.episodeMonitorPending}
        allEpisodesMonitored={m.sonarr.allEpisodesMonitored}
        onSeasonToggle={m.sonarr.handleSeasonMonitorToggle}
        onBatchEpisodeToggle={m.sonarr.handleBatchMonitorToggle}
        isSeasonWatched={m.isSeasonWatched}
        batchLogPending={m.watch.batchLogPending}
        onMarkSeasonWatched={m.watch.handleBatchMarkWatched}
      />
      <EpisodesSection
        episodesLoading={m.episodesLoading}
        episodes={m.episodes}
        watch={m.watch}
        sonarr={m.sonarr}
      />
    </div>
  );
}
