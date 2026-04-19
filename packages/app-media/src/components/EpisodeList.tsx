import { ExpandableListRow } from './ExpandableListRow';

interface Episode {
  id: number;
  episodeNumber: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  runtime: number | null;
}

export interface EpisodeListProps {
  episodes: Episode[];
  /** Set of episode IDs that have been watched. */
  watchedEpisodeIds?: Set<number>;
  /** Called when user toggles an episode's watched state. */
  onToggleWatched?: (episodeId: number, watched: boolean) => void;
  /** Episode IDs currently being toggled (pending mutation). */
  togglingIds?: Set<number>;
  /** Map from episode number to Sonarr monitoring state. */
  monitoredMap?: Map<number, boolean>;
  /** Map from episode number to whether the episode has a file on disk. */
  hasFileMap?: Map<number, boolean>;
  /** Called when user toggles an episode's monitoring state. */
  onToggleMonitored?: (episodeNumber: number, monitored: boolean) => void;
  /** Episode numbers currently being toggled for monitoring. */
  monitoringPendingIds?: Set<number>;
}

function isUpcoming(airDate: string | null): boolean {
  if (!airDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(airDate) > today;
}

export function EpisodeList({
  episodes,
  watchedEpisodeIds,
  onToggleWatched,
  togglingIds,
  monitoredMap,
  hasFileMap,
  onToggleMonitored,
  monitoringPendingIds,
}: EpisodeListProps) {
  const watched = watchedEpisodeIds ?? new Set<number>();
  const toggling = togglingIds ?? new Set<number>();

  if (episodes.length === 0) {
    return <p className="text-muted-foreground text-sm">No episodes available.</p>;
  }

  return (
    <div className="divide-y divide-border rounded-lg border">
      {episodes.map((ep) => (
        <ExpandableListRow
          key={ep.id}
          item={ep}
          isWatched={watched.has(ep.id)}
          isToggling={toggling.has(ep.id)}
          onToggleWatched={onToggleWatched}
          isMonitored={monitoredMap?.get(ep.episodeNumber)}
          hasFile={hasFileMap?.get(ep.episodeNumber)}
          onToggleMonitored={onToggleMonitored}
          isMonitoringPending={monitoringPendingIds?.has(ep.episodeNumber)}
          isUpcoming={isUpcoming(ep.airDate)}
        />
      ))}
    </div>
  );
}
