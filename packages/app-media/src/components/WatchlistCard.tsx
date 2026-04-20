import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Film, GripVertical, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { Badge, Button } from '@pops/ui';

import { LeavingBadge } from './LeavingBadge';

import type { DraggableAttributes } from '@dnd-kit/core';

import type { RotationMeta } from '../lib/types';

/**
 * WatchlistCard — desktop poster card for a watchlist entry.
 * Supports drag-and-drop via optional dragListeners/dragAttributes from useSortable.
 */

interface WatchlistEntry {
  id: number;
  mediaType: string;
  mediaId: number;
  priority: number | null;
  notes: string | null;
  addedAt: string;
  title?: string | null;
  posterUrl?: string | null;
}

export interface WatchlistCardProps extends RotationMeta {
  entry: WatchlistEntry;
  title: string;
  year: number | null;
  posterUrl: string | null;
  priority: number;
  onRemove: (id: number) => void;
  isRemoving: boolean;
  dragAttributes?: DraggableAttributes;
  dragListeners?: Record<string, unknown>;
}

function PosterImage({
  posterUrl,
  title,
  imageError,
  setImageError,
}: {
  posterUrl: string | null;
  title: string;
  imageError: boolean;
  setImageError: (v: boolean) => void;
}) {
  if (!posterUrl || imageError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
        <Film className="h-10 w-10 opacity-40" />
      </div>
    );
  }
  return (
    <img
      src={posterUrl}
      alt={`${title} poster`}
      loading="lazy"
      className="h-full w-full object-cover group-hover:opacity-80 transition-opacity"
      onError={() => {
        setImageError(true);
      }}
    />
  );
}

function CardActions({
  entry,
  title,
  isRemoving,
  onRemove,
  dragAttributes,
  dragListeners,
}: Pick<
  WatchlistCardProps,
  'entry' | 'title' | 'isRemoving' | 'onRemove' | 'dragAttributes' | 'dragListeners'
>) {
  return (
    <>
      {dragListeners && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Drag to reorder ${title}`}
          className="absolute top-2 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white rounded-md h-auto w-auto p-1 cursor-grab active:cursor-grabbing hover:bg-black/80"
          onClick={(e) => {
            e.stopPropagation();
          }}
          {...dragListeners}
          {...dragAttributes}
        >
          <GripVertical className="h-4 w-4" />
        </Button>
      )}
      <Badge
        variant={entry.mediaType === 'movie' ? 'default' : 'secondary'}
        className="absolute top-2 right-2 z-10"
      >
        {entry.mediaType === 'movie' ? 'Movie' : 'TV'}
      </Badge>
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(entry.id);
        }}
        disabled={isRemoving}
        aria-label={`Remove ${title} from watchlist`}
        className="absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity h-auto w-auto p-1.5 text-destructive hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </>
  );
}

export function WatchlistCard(props: WatchlistCardProps) {
  const { entry, title, year, posterUrl, priority, rotationStatus, rotationExpiresAt } = props;
  const navigate = useNavigate();
  const [imageError, setImageError] = useState(false);

  const href =
    entry.mediaType === 'movie' ? `/media/movies/${entry.mediaId}` : `/media/tv/${entry.mediaId}`;

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
        <div className="absolute top-2 left-2 z-10 bg-primary text-primary-foreground text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center">
          #{priority}
        </div>
        <CardActions {...props} />
        <PosterImage
          posterUrl={posterUrl}
          title={title}
          imageError={imageError}
          setImageError={setImageError}
        />
      </div>

      <div className="space-y-0.5 px-0.5">
        <Link to={href} className="hover:underline">
          <h3 className="text-sm font-medium leading-tight line-clamp-2">{title}</h3>
        </Link>
        {year && <p className="text-xs text-muted-foreground">{year}</p>}
        {rotationStatus === 'leaving' && rotationExpiresAt && (
          <LeavingBadge rotationExpiresAt={rotationExpiresAt} />
        )}
        {entry.notes && <p className="text-xs text-muted-foreground line-clamp-1">{entry.notes}</p>}
      </div>
    </div>
  );
}

export function SortableWatchlistCard(props: WatchlistCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.entry.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <WatchlistCard {...props} dragAttributes={attributes} dragListeners={listeners} />
    </div>
  );
}
