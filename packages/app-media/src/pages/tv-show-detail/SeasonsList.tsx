import { Link } from 'react-router';

import { Switch } from '@pops/ui';

import { ProgressBar } from '../../components/ProgressBar';

import type { ProgressData, SeasonRow, SonarrSeriesData } from './types';

interface SeasonsListProps {
  showId: number;
  seasons: SeasonRow[];
  progress: ProgressData | undefined;
  sonarrSeries: SonarrSeriesData | undefined;
  optimisticMonitoring: Map<number, boolean>;
  pendingSeasons: Set<number>;
  onMonitorChange: (seasonNumber: number, checked: boolean, sonarrId: number) => void;
}

function SeasonProgressBar({
  seasonProg,
}: {
  seasonProg: { watched: number; total: number } | undefined;
}) {
  if (!seasonProg || seasonProg.total === 0) return null;
  return (
    <div className="w-24">
      <ProgressBar watched={seasonProg.watched} total={seasonProg.total} showLabel={false} />
    </div>
  );
}

function MonitorSwitch({
  label,
  isMonitored,
  isPending,
  sonarrId,
  seasonNumber,
  onChange,
}: {
  label: string;
  isMonitored: boolean;
  isPending: boolean;
  sonarrId: number;
  seasonNumber: number;
  onChange: (seasonNumber: number, checked: boolean, sonarrId: number) => void;
}) {
  return (
    <Switch
      size="sm"
      checked={isMonitored}
      aria-label={`Monitor ${label}`}
      disabled={isPending}
      onCheckedChange={(checked: boolean) => onChange(seasonNumber, checked, sonarrId)}
    />
  );
}

function getSeasonLabel(season: SeasonRow): string {
  if (season.seasonNumber === 0) return 'Specials';
  return season.name ?? `Season ${season.seasonNumber}`;
}

function getMonitoredState(
  season: SeasonRow,
  sonarrSeries: SonarrSeriesData | undefined,
  optimisticMonitoring: Map<number, boolean>
): boolean {
  const sonarrSeason = sonarrSeries?.seasons?.find((s) => s.seasonNumber === season.seasonNumber);
  return optimisticMonitoring.get(season.seasonNumber) ?? sonarrSeason?.monitored ?? false;
}

function SeasonRowLink({
  showId,
  season,
  progress,
}: {
  showId: number;
  season: SeasonRow;
  progress: ProgressData | undefined;
}) {
  const seasonProg = progress?.seasons?.find((s) => s.seasonNumber === season.seasonNumber);
  return (
    <Link
      to={`/media/tv/${showId}/season/${season.seasonNumber}`}
      className="flex items-center gap-3 flex-1 min-w-0"
    >
      <span className="text-sm font-medium flex-1">{getSeasonLabel(season)}</span>
      {season.episodeCount != null && (
        <span className="text-xs text-muted-foreground">{season.episodeCount} episodes</span>
      )}
      <SeasonProgressBar seasonProg={seasonProg} />
    </Link>
  );
}

function SeasonRowItem({
  showId,
  season,
  progress,
  sonarrSeries,
  optimisticMonitoring,
  pendingSeasons,
  onMonitorChange,
}: SeasonsListProps & { season: SeasonRow }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
      <SeasonRowLink showId={showId} season={season} progress={progress} />
      {sonarrSeries?.exists && sonarrSeries.sonarrId != null && (
        <MonitorSwitch
          label={getSeasonLabel(season)}
          isMonitored={getMonitoredState(season, sonarrSeries, optimisticMonitoring)}
          isPending={pendingSeasons.has(season.seasonNumber)}
          sonarrId={sonarrSeries.sonarrId}
          seasonNumber={season.seasonNumber}
          onChange={onMonitorChange}
        />
      )}
    </div>
  );
}

export function SeasonsList(props: SeasonsListProps) {
  if (props.seasons.length === 0) {
    return <p className="text-muted-foreground">No seasons available</p>;
  }
  return (
    <div className="space-y-2">
      {props.seasons.map((season) => (
        <SeasonRowItem key={season.id} {...props} season={season} />
      ))}
    </div>
  );
}
