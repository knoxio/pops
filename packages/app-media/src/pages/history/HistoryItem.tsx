import { ClipboardCheck, Trash2 } from 'lucide-react';
import { Link } from 'react-router';

import { Badge, Button } from '@pops/ui';

import { formatEpisodeCode } from '../../lib/format';
import { formatWatchDate, getHistoryHref, type HistoryEntry } from './types';

interface HistoryItemProps {
  entry: HistoryEntry;
  onDelete: (id: number) => void;
  isDeleting: boolean;
  debriefSessionId: number | null;
}

function EpisodeMeta({ entry }: { entry: HistoryEntry }) {
  if (entry.seasonNumber == null || entry.episodeNumber == null) return null;
  const episodeCode = formatEpisodeCode(entry.seasonNumber, entry.episodeNumber);
  return (
    <p className="text-xs text-muted-foreground truncate">
      <Link to={`/media/tv/${entry.tvShowId}`} className="hover:underline">
        {entry.showName}
      </Link>
      {' — '}
      <Link
        to={`/media/tv/${entry.tvShowId}?season=${entry.seasonNumber}`}
        className="hover:underline"
      >
        {episodeCode}
      </Link>
    </p>
  );
}

function ItemActions({
  entryId,
  isDeleting,
  onDelete,
  debriefSessionId,
  isEpisode,
}: {
  entryId: number;
  isDeleting: boolean;
  onDelete: (id: number) => void;
  debriefSessionId: number | null;
  isEpisode: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {debriefSessionId != null && (
        <Link
          to={`/media/debrief/${debriefSessionId}`}
          aria-label="Debrief"
          className="p-1 h-auto w-auto rounded-sm text-primary hover:bg-primary/10 inline-flex items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
        </Link>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Delete watch event"
        disabled={isDeleting}
        onClick={() => onDelete(entryId)}
        className="p-1 h-auto w-auto hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <Badge variant="secondary" className="text-xs">
        {isEpisode ? 'Episode' : 'Movie'}
      </Badge>
    </div>
  );
}

export function HistoryItem({ entry, onDelete, isDeleting, debriefSessionId }: HistoryItemProps) {
  const href = getHistoryHref(entry);
  const isEpisode = entry.mediaType === 'episode';
  const title = entry.title ?? 'Unknown';
  const hasEpisodeInfo =
    isEpisode &&
    entry.showName != null &&
    entry.seasonNumber != null &&
    entry.episodeNumber != null;

  return (
    <div className="group flex gap-3 p-3 rounded-lg border">
      <Link to={href} className="shrink-0">
        {entry.posterUrl ? (
          <img
            src={entry.posterUrl}
            alt={`${title} poster`}
            className="w-12 aspect-[2/3] rounded object-cover bg-muted"
            loading="lazy"
          />
        ) : (
          <div className="w-12 aspect-[2/3] rounded bg-muted" />
        )}
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={href} className="hover:underline">
              <h3 className="text-sm font-medium truncate">{title}</h3>
            </Link>
            {hasEpisodeInfo && <EpisodeMeta entry={entry} />}
          </div>
          <ItemActions
            entryId={entry.id}
            isDeleting={isDeleting}
            onDelete={onDelete}
            debriefSessionId={debriefSessionId}
            isEpisode={isEpisode}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">{formatWatchDate(entry.watchedAt)}</p>
      </div>
    </div>
  );
}
