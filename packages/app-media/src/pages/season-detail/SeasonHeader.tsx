import { ProgressBar } from '../../components/ProgressBar';
import { SeasonMonitoringControls } from './SeasonMonitoringControls';
import { SeasonWatchedActions } from './SeasonWatchedActions';

interface Season {
  id: number;
  name: string | null;
  posterUrl: string | null;
  airDate: string | null;
  overview: string | null;
}

interface Progress {
  watched: number;
  total: number;
}

interface SeasonHeaderProps {
  season: Season;
  seasonLabel: string;
  episodeCount: number;
  seasonProgress: Progress | undefined;
  sonarrSeries: { exists: boolean; sonarrId?: number | null } | undefined;
  hasSonarrEpisodes: boolean;
  effectiveMonitored: boolean;
  seasonMonitorPending: boolean;
  episodeMonitorPending: boolean;
  allEpisodesMonitored: boolean;
  onSeasonToggle: (checked: boolean) => void;
  onBatchEpisodeToggle: () => void;
  isSeasonWatched: boolean;
  batchLogPending: boolean;
  onMarkSeasonWatched: () => void;
}

export function SeasonHeader({
  season,
  seasonLabel,
  episodeCount,
  seasonProgress,
  sonarrSeries,
  hasSonarrEpisodes,
  effectiveMonitored,
  seasonMonitorPending,
  episodeMonitorPending,
  allEpisodesMonitored,
  onSeasonToggle,
  onBatchEpisodeToggle,
  isSeasonWatched,
  batchLogPending,
  onMarkSeasonWatched,
}: SeasonHeaderProps) {
  const posterSrc = season.posterUrl;

  return (
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
          {episodeCount > 0 && <span>{episodeCount} episodes</span>}
          {episodeCount > 0 && season.airDate && <span>·</span>}
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

        <SeasonMonitoringControls
          seasonLabel={seasonLabel}
          sonarrSeries={sonarrSeries}
          hasSonarrEpisodes={hasSonarrEpisodes}
          effectiveMonitored={effectiveMonitored}
          seasonMonitorPending={seasonMonitorPending}
          episodeMonitorPending={episodeMonitorPending}
          allEpisodesMonitored={allEpisodesMonitored}
          onSeasonToggle={onSeasonToggle}
          onBatchEpisodeToggle={onBatchEpisodeToggle}
        />

        {season.id != null && (
          <SeasonWatchedActions
            isSeasonWatched={isSeasonWatched}
            isPending={batchLogPending}
            onMarkWatched={onMarkSeasonWatched}
          />
        )}
      </div>
    </div>
  );
}
