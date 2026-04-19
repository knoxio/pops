import { CheckCircle, Clock, Film } from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '@pops/ui';

import { formatEpisodeCode } from '../../lib/format';

interface Episode {
  id: number;
  seriesId: number;
  seriesTitle: string;
  episodeTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  airDateUtc: string;
  hasFile: boolean;
  posterUrl: string | null;
}

function PosterThumb({
  posterUrl,
  seriesTitle,
}: {
  posterUrl: string | null;
  seriesTitle: string;
}) {
  if (posterUrl) {
    return (
      <img
        src={posterUrl}
        alt={seriesTitle}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
      <Film className="h-5 w-5 opacity-40" />
    </div>
  );
}

function StatusBadge({ hasFile }: { hasFile: boolean }) {
  if (hasFile) {
    return (
      <Badge variant="secondary" className="gap-0.5 text-2xs bg-success text-success-foreground">
        <CheckCircle className="h-2.5 w-2.5" />
        Downloaded
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-0.5 text-2xs">
      <Clock className="h-2.5 w-2.5" />
      Missing
    </Badge>
  );
}

export function CalendarEpisodeRow({ ep }: { ep: Episode }) {
  return (
    <Link
      to={`/media/tv/${ep.seriesId}`}
      className="flex gap-3 rounded-lg border bg-card p-3 text-card-foreground hover:bg-accent transition-colors"
    >
      <div className="w-12 shrink-0 overflow-hidden rounded bg-muted aspect-[2/3]">
        <PosterThumb posterUrl={ep.posterUrl} seriesTitle={ep.seriesTitle} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium truncate">{ep.seriesTitle}</h3>
          <Badge variant="outline" className="shrink-0 text-2xs">
            {formatEpisodeCode(ep.seasonNumber, ep.episodeNumber)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{ep.episodeTitle}</p>
        <div className="flex items-center gap-1 mt-1">
          <StatusBadge hasFile={ep.hasFile} />
        </div>
      </div>
      <div className="text-xs text-muted-foreground shrink-0 self-center">
        {new Date(ep.airDateUtc).toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        })}
      </div>
    </Link>
  );
}
