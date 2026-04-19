import { Button, Switch } from '@pops/ui';

interface SeasonMonitoringControlsProps {
  seasonLabel: string;
  sonarrSeries: { exists: boolean; sonarrId?: number | null } | undefined;
  hasSonarrEpisodes: boolean;
  effectiveMonitored: boolean;
  seasonMonitorPending: boolean;
  episodeMonitorPending: boolean;
  allEpisodesMonitored: boolean;
  onSeasonToggle: (checked: boolean) => void;
  onBatchEpisodeToggle: () => void;
}

/**
 * Renders the Sonarr-driven monitoring controls inside the season header:
 * - season-level monitor switch (with Monitored/Unmonitored label)
 * - Monitor All / Unmonitor All button for episodes
 */
export function SeasonMonitoringControls({
  seasonLabel,
  sonarrSeries,
  hasSonarrEpisodes,
  effectiveMonitored,
  seasonMonitorPending,
  episodeMonitorPending,
  allEpisodesMonitored,
  onSeasonToggle,
  onBatchEpisodeToggle,
}: SeasonMonitoringControlsProps) {
  if (!sonarrSeries?.exists) return null;

  return (
    <>
      {sonarrSeries.sonarrId != null && (
        <div className="flex items-center gap-2 mt-3">
          <Switch
            size="sm"
            checked={effectiveMonitored}
            aria-label={`Monitor ${seasonLabel}`}
            disabled={seasonMonitorPending}
            onCheckedChange={onSeasonToggle}
          />
          <span className="text-sm text-muted-foreground">
            {effectiveMonitored ? 'Monitored' : 'Unmonitored'}
          </span>
        </div>
      )}

      {hasSonarrEpisodes && (
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onBatchEpisodeToggle}
            disabled={episodeMonitorPending}
          >
            {allEpisodesMonitored ? 'Unmonitor All' : 'Monitor All'}
          </Button>
        </div>
      )}
    </>
  );
}
