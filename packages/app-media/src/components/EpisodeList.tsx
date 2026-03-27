import { useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { formatRuntime } from "../lib/utils";

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
}

function isUpcoming(airDate: string | null): boolean {
  if (!airDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(airDate) > today;
}

function EpisodeRow({
  ep,
  isExpanded,
  onToggle,
  isWatched,
  isToggling,
  onToggleWatched,
}: {
  ep: Episode;
  isExpanded: boolean;
  onToggle: () => void;
  isWatched: boolean;
  isToggling: boolean;
  onToggleWatched?: (episodeId: number, watched: boolean) => void;
}) {
  const hasOverview = ep.overview && ep.overview.length > 0;
  const upcoming = isUpcoming(ep.airDate);

  return (
    <div className={`px-4 py-3${upcoming ? " opacity-50" : ""}`}>
      <div className="flex items-start gap-3">
        {onToggleWatched && (
          <button
            type="button"
            onClick={() => onToggleWatched(ep.id, !isWatched)}
            disabled={isToggling || upcoming}
            aria-label={
              upcoming
                ? `Episode ${ep.episodeNumber} upcoming`
                : isWatched
                  ? `Mark episode ${ep.episodeNumber} as unwatched`
                  : `Mark episode ${ep.episodeNumber} as watched`
            }
            className={`mt-0.5 shrink-0 flex items-center justify-center h-5 w-5 rounded border transition-colors ${
              isToggling || upcoming
                ? "opacity-50 cursor-not-allowed border-muted"
                : isWatched
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-muted-foreground/40 hover:border-primary"
            }`}
          >
            {isWatched && <Check className="h-3.5 w-3.5" />}
          </button>
        )}

        {hasOverview ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            className="mt-0.5 text-muted-foreground shrink-0 hover:text-foreground"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : null}

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-muted-foreground shrink-0">
              {ep.episodeNumber}
            </span>
            <span
              className={`text-sm font-medium truncate ${isWatched ? "text-muted-foreground" : ""}`}
            >
              {ep.name ?? `Episode ${ep.episodeNumber}`}
            </span>
            {upcoming && (
              <span className="text-xs text-yellow-500 font-medium shrink-0">Upcoming</span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
            {ep.airDate && <span>{ep.airDate}</span>}
            {ep.airDate && ep.runtime && <span>·</span>}
            {ep.runtime && <span>{formatRuntime(ep.runtime)}</span>}
          </div>
        </div>
      </div>

      {isExpanded && hasOverview && (
        <p className="mt-2 ml-7 text-sm text-muted-foreground leading-relaxed">{ep.overview}</p>
      )}
    </div>
  );
}

export function EpisodeList({
  episodes,
  watchedEpisodeIds,
  onToggleWatched,
  togglingIds,
}: EpisodeListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const watched = watchedEpisodeIds ?? new Set<number>();
  const toggling = togglingIds ?? new Set<number>();

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (episodes.length === 0) {
    return <p className="text-muted-foreground text-sm">No episodes available.</p>;
  }

  return (
    <div className="divide-y divide-border rounded-lg border">
      {episodes.map((ep) => (
        <EpisodeRow
          key={ep.id}
          ep={ep}
          isExpanded={expandedIds.has(ep.id)}
          onToggle={() => toggleExpanded(ep.id)}
          isWatched={watched.has(ep.id)}
          isToggling={toggling.has(ep.id)}
          onToggleWatched={onToggleWatched}
        />
      ))}
    </div>
  );
}
