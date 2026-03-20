import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatRuntime } from "../lib/utils";

interface Episode {
  id: number;
  episodeNumber: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  runtime: number | null;
}

interface EpisodeListProps {
  episodes: Episode[];
}

function EpisodeRow({
  ep,
  isExpanded,
  onToggle,
}: {
  ep: Episode;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasOverview = ep.overview && ep.overview.length > 0;

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
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
            <span className="text-sm font-medium truncate">
              {ep.name ?? `Episode ${ep.episodeNumber}`}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
            {ep.airDate && <span>{ep.airDate}</span>}
            {ep.airDate && ep.runtime && <span>·</span>}
            {ep.runtime && <span>{formatRuntime(ep.runtime)}</span>}
          </div>
        </div>
      </div>

      {isExpanded && hasOverview && (
        <p className="mt-2 ml-7 text-sm text-muted-foreground leading-relaxed">
          {ep.overview}
        </p>
      )}
    </div>
  );
}

export function EpisodeList({ episodes }: EpisodeListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

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
    return (
      <p className="text-muted-foreground text-sm">No episodes available.</p>
    );
  }

  return (
    <div className="divide-y divide-border rounded-lg border">
      {episodes.map((ep) => (
        <EpisodeRow
          key={ep.id}
          ep={ep}
          isExpanded={expandedIds.has(ep.id)}
          onToggle={() => toggleExpanded(ep.id)}
        />
      ))}
    </div>
  );
}
