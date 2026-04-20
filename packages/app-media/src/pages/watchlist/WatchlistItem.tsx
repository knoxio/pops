import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { Link } from 'react-router';

import { Badge, Button } from '@pops/ui';

import { LeavingBadge } from '../../components/LeavingBadge';
import { useWatchlistItemNotes } from './useWatchlistItemNotes';
import { NotesEditor, NotesView } from './WatchlistItemNotes';

import type { RotationMeta } from '../../lib/types';
import type { WatchlistEntry } from './types';

export interface WatchlistItemProps extends RotationMeta {
  entry: WatchlistEntry;
  title: string;
  year: number | null;
  posterUrl: string | null;
  priority: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: (id: number) => void;
  isRemoving: boolean;
  isReordering: boolean;
  showReorderControls?: boolean;
  onUpdateNotes: (id: number, notes: string | null) => void;
  isUpdating: boolean;
  updateError: string | null;
}

function ReorderButtons({
  isFirst,
  isLast,
  isReordering,
  onMoveUp,
  onMoveDown,
  title,
}: Pick<
  WatchlistItemProps,
  'isFirst' | 'isLast' | 'isReordering' | 'onMoveUp' | 'onMoveDown' | 'title'
>) {
  return (
    <div className="flex flex-col justify-center gap-1 shrink-0">
      <Button
        size="icon"
        variant="ghost"
        disabled={isFirst || isReordering}
        onClick={onMoveUp}
        aria-label={`Move ${title} up`}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        disabled={isLast || isReordering}
        onClick={onMoveDown}
        aria-label={`Move ${title} down`}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function PosterLink({
  href,
  posterUrl,
  title,
}: {
  href: string;
  posterUrl: string | null;
  title: string;
}) {
  return (
    <Link to={href} className="shrink-0">
      {posterUrl ? (
        <img
          src={posterUrl}
          alt={`${title} poster`}
          className="w-16 aspect-[2/3] rounded object-cover bg-muted"
          loading="lazy"
        />
      ) : (
        <div className="w-16 aspect-[2/3] rounded bg-muted" />
      )}
    </Link>
  );
}

function ItemHeader({
  href,
  title,
  priority,
  entry,
  year,
  rotationStatus,
  rotationExpiresAt,
  isRemoving,
  onRemove,
}: Pick<
  WatchlistItemProps,
  | 'title'
  | 'priority'
  | 'entry'
  | 'year'
  | 'rotationStatus'
  | 'rotationExpiresAt'
  | 'isRemoving'
  | 'onRemove'
> & { href: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <Link to={href} className="hover:underline">
          <h3 className="text-sm font-medium truncate">{title}</h3>
        </Link>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center shrink-0">
            {priority}
          </span>
          <Badge variant="secondary" className="text-xs">
            {entry.mediaType === 'movie' ? 'Movie' : 'TV'}
          </Badge>
          {year && <span className="text-xs text-muted-foreground">{year}</span>}
          {rotationStatus === 'leaving' && rotationExpiresAt && (
            <LeavingBadge rotationExpiresAt={rotationExpiresAt} />
          )}
        </div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onRemove(entry.id)}
        disabled={isRemoving}
        aria-label={`Remove ${title} from watchlist`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function WatchlistItem(props: WatchlistItemProps) {
  const {
    entry,
    title,
    posterUrl,
    showReorderControls = true,
    onUpdateNotes,
    isUpdating,
    updateError,
  } = props;
  const notesModel = useWatchlistItemNotes({
    notes: entry.notes,
    isUpdating,
    updateError,
    entryId: entry.id,
    onUpdateNotes,
  });

  const href =
    entry.mediaType === 'movie' ? `/media/movies/${entry.mediaId}` : `/media/tv/${entry.mediaId}`;

  return (
    <div className="flex gap-4 p-3 rounded-lg border" role="listitem">
      {showReorderControls && <ReorderButtons {...props} />}
      <PosterLink href={href} posterUrl={posterUrl} title={title} />
      <div className="flex-1 min-w-0">
        <ItemHeader href={href} {...props} />
        {notesModel.editing ? (
          <NotesEditor
            draft={notesModel.draft}
            setDraft={notesModel.setDraft}
            handleKeyDown={notesModel.handleKeyDown}
            handleSave={notesModel.handleSave}
            handleCancel={notesModel.handleCancel}
            isUpdating={isUpdating}
            textareaRef={notesModel.textareaRef}
            title={title}
            updateError={updateError}
          />
        ) : (
          <NotesView
            notes={entry.notes}
            title={title}
            onClickEdit={() => notesModel.setEditing(true)}
          />
        )}
      </div>
    </div>
  );
}
