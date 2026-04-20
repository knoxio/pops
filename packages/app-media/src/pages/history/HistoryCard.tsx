import { ClipboardCheck, Film, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { Badge, Button } from '@pops/ui';

import { formatEpisodeCode } from '../../lib/format';
import { formatShortDate, getHistoryHref, type HistoryEntry } from './types';

interface HistoryCardProps {
  entry: HistoryEntry;
  onDelete: (id: number) => void;
  isDeleting: boolean;
  debriefSessionId: number | null;
}

function PosterImage({
  posterSrc,
  imageError,
  setImageError,
  title,
}: {
  posterSrc: string | null;
  imageError: boolean;
  setImageError: (v: boolean) => void;
  title: string;
}) {
  if (!posterSrc || imageError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
        <Film className="h-10 w-10 opacity-40" />
      </div>
    );
  }
  return (
    <img
      src={posterSrc}
      alt={`${title} poster`}
      loading="lazy"
      className="h-full w-full object-cover group-hover:opacity-80 transition-opacity"
      onError={() => setImageError(true)}
    />
  );
}

function CardOverlays({
  entry,
  isEpisode,
  isDeleting,
  onDelete,
  debriefSessionId,
}: {
  entry: HistoryEntry;
  isEpisode: boolean;
  isDeleting: boolean;
  onDelete: (id: number) => void;
  debriefSessionId: number | null;
}) {
  return (
    <>
      <Badge variant={isEpisode ? 'secondary' : 'default'} className="absolute top-2 left-2 z-10">
        {isEpisode ? 'Episode' : 'Movie'}
      </Badge>
      <span className="absolute top-2 right-2 z-10 bg-black/60 text-white text-2xs font-medium px-1.5 py-0.5 rounded">
        {formatShortDate(entry.watchedAt)}
      </span>
      {debriefSessionId != null && (
        <Link
          to={`/media/debrief/${debriefSessionId}`}
          aria-label="Debrief"
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-2 left-2 z-10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1.5 h-auto w-auto rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center"
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
        </Link>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Delete watch event"
        disabled={isDeleting}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(entry.id);
        }}
        className="absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1.5 h-auto w-auto rounded-md bg-black/60 hover:bg-destructive text-white"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </>
  );
}

function CardEpisodeMeta({ entry }: { entry: HistoryEntry }) {
  if (entry.seasonNumber == null || entry.episodeNumber == null) return null;
  const episodeCode = formatEpisodeCode(entry.seasonNumber, entry.episodeNumber);
  return (
    <p className="text-xs text-muted-foreground line-clamp-1">
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

export function HistoryCard({ entry, onDelete, isDeleting, debriefSessionId }: HistoryCardProps) {
  const navigate = useNavigate();
  const [imageError, setImageError] = useState(false);
  const href = getHistoryHref(entry);
  const isEpisode = entry.mediaType === 'episode';
  const title = entry.title ?? 'Unknown';
  const hasEpisodeInfo =
    isEpisode &&
    entry.showName != null &&
    entry.seasonNumber != null &&
    entry.episodeNumber != null;

  return (
    <div className="group flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        className="relative w-full overflow-hidden rounded-md bg-muted aspect-[2/3] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => navigate(href)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void navigate(href);
          }
        }}
      >
        <CardOverlays
          entry={entry}
          isEpisode={isEpisode}
          isDeleting={isDeleting}
          onDelete={onDelete}
          debriefSessionId={debriefSessionId}
        />
        <PosterImage
          posterSrc={entry.posterUrl}
          imageError={imageError}
          setImageError={setImageError}
          title={title}
        />
      </div>
      <div className="space-y-0.5 px-0.5">
        <Link to={href} className="hover:underline">
          <h3 className="text-sm font-medium leading-tight line-clamp-2">{title}</h3>
        </Link>
        {hasEpisodeInfo && <CardEpisodeMeta entry={entry} />}
      </div>
    </div>
  );
}
