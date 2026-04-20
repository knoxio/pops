import { Check, ChevronDown, ChevronRight, HardDrive } from 'lucide-react';
import { useState } from 'react';

import { Switch } from '@pops/ui';

import { formatRuntime } from '../lib/format';

/**
 * ExpandableListRow — a single row in a bordered list with optional:
 *   - watched checkbox
 *   - expand/collapse chevron for overview text
 *   - air-date + runtime metadata
 *   - downloaded (HardDrive) indicator
 *   - Sonarr monitoring toggle
 *
 * Extracted from EpisodeList so it can be reused in other list contexts.
 */

export interface ExpandableListRowItem {
  id: number;
  episodeNumber: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  runtime: number | null;
}

export interface ExpandableListRowProps {
  item: ExpandableListRowItem;
  isWatched?: boolean;
  isToggling?: boolean;
  onToggleWatched?: (id: number, watched: boolean) => void;
  isMonitored?: boolean;
  hasFile?: boolean;
  onToggleMonitored?: (episodeNumber: number, monitored: boolean) => void;
  isMonitoringPending?: boolean;
  isUpcoming?: boolean;
}

function EpisodeMeta({ airDate, runtime }: { airDate: string | null; runtime: number | null }) {
  return (
    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
      {airDate && <span>{airDate}</span>}
      {airDate && runtime && <span>·</span>}
      {runtime && <span>{formatRuntime(runtime)}</span>}
    </div>
  );
}

function watchedAriaLabel(item: ExpandableListRowItem, isUpcoming: boolean, isWatched: boolean) {
  if (isUpcoming) return `Episode ${item.episodeNumber} upcoming`;
  if (isWatched) return `Mark episode ${item.episodeNumber} as unwatched`;
  return `Mark episode ${item.episodeNumber} as watched`;
}

function watchedClass(isToggling: boolean, isUpcoming: boolean, isWatched: boolean) {
  if (isToggling || isUpcoming) return 'opacity-50 cursor-not-allowed border-muted';
  if (isWatched) return 'bg-primary border-primary text-primary-foreground';
  return 'border-muted-foreground/40 hover:border-primary';
}

function WatchedToggle({
  item,
  isWatched,
  isToggling,
  isUpcoming,
  onToggleWatched,
}: {
  item: ExpandableListRowItem;
  isWatched: boolean;
  isToggling: boolean;
  isUpcoming: boolean;
  onToggleWatched: (id: number, watched: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onToggleWatched(item.id, !isWatched);
      }}
      disabled={isToggling || isUpcoming}
      aria-label={watchedAriaLabel(item, isUpcoming, isWatched)}
      className={`mt-0.5 shrink-0 flex items-center justify-center h-5 w-5 rounded border transition-colors ${watchedClass(isToggling, isUpcoming, isWatched)}`}
    >
      {isWatched && <Check className="h-3.5 w-3.5" />}
    </button>
  );
}

function ExpandToggle({
  item,
  isExpanded,
  setIsExpanded,
}: {
  item: ExpandableListRowItem;
  isExpanded: boolean;
  setIsExpanded: (fn: (v: boolean) => boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => setIsExpanded((v) => !v)}
      aria-expanded={isExpanded}
      aria-label={
        isExpanded
          ? `Hide overview for episode ${item.episodeNumber}`
          : `Show overview for episode ${item.episodeNumber}`
      }
      className="mt-0.5 text-muted-foreground shrink-0 hover:text-foreground"
    >
      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </button>
  );
}

function EpisodeTitle({
  item,
  isWatched,
  isUpcoming,
}: {
  item: ExpandableListRowItem;
  isWatched: boolean;
  isUpcoming: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-sm font-medium text-muted-foreground shrink-0">
        {item.episodeNumber}
      </span>
      <span className={`text-sm font-medium truncate ${isWatched ? 'text-muted-foreground' : ''}`}>
        {item.name ?? `Episode ${item.episodeNumber}`}
      </span>
      {isUpcoming && <span className="text-xs text-warning font-medium shrink-0">Upcoming</span>}
    </div>
  );
}

export function ExpandableListRow({
  item,
  isWatched = false,
  isToggling = false,
  onToggleWatched,
  isMonitored,
  hasFile,
  onToggleMonitored,
  isMonitoringPending,
  isUpcoming = false,
}: ExpandableListRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasOverview = !!item.overview;

  return (
    <div className={`px-4 py-3${isUpcoming ? ' opacity-50' : ''}`}>
      <div className="flex items-start gap-3">
        {onToggleWatched && (
          <WatchedToggle
            item={item}
            isWatched={isWatched}
            isToggling={isToggling}
            isUpcoming={isUpcoming}
            onToggleWatched={onToggleWatched}
          />
        )}
        {hasOverview && (
          <ExpandToggle item={item} isExpanded={isExpanded} setIsExpanded={setIsExpanded} />
        )}
        <div className="flex-1 min-w-0">
          <EpisodeTitle item={item} isWatched={isWatched} isUpcoming={isUpcoming} />
          <EpisodeMeta airDate={item.airDate} runtime={item.runtime} />
        </div>
        {hasFile && (
          <span
            className="shrink-0 text-success"
            title="Downloaded"
            aria-label={`Episode ${item.episodeNumber} downloaded`}
          >
            <HardDrive className="h-4 w-4" />
          </span>
        )}
        {onToggleMonitored && isMonitored !== undefined && (
          <Switch
            size="sm"
            checked={isMonitored}
            aria-label={`Monitor episode ${item.episodeNumber}`}
            disabled={isMonitoringPending}
            onCheckedChange={(checked: boolean) => {
              onToggleMonitored(item.episodeNumber, checked);
            }}
          />
        )}
      </div>
      {isExpanded && hasOverview && (
        <p className="mt-2 ml-7 text-sm text-muted-foreground leading-relaxed">{item.overview}</p>
      )}
    </div>
  );
}
