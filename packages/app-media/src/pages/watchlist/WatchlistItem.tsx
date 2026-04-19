import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { Badge, Button, Textarea } from '@pops/ui';

import { LeavingBadge } from '../../components/LeavingBadge';

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

export function WatchlistItem({
  entry,
  title,
  year,
  posterUrl,
  priority,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
  isRemoving,
  isReordering,
  showReorderControls = true,
  onUpdateNotes,
  isUpdating,
  updateError,
  rotationStatus,
  rotationExpiresAt,
}: WatchlistItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.notes ?? '');
  const savePending = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const href =
    entry.mediaType === 'movie' ? `/media/movies/${entry.mediaId}` : `/media/tv/${entry.mediaId}`;

  useEffect(() => {
    if (!editing) {
      setDraft(entry.notes ?? '');
    }
  }, [entry.notes, editing]);

  useEffect(() => {
    if (savePending.current && !isUpdating) {
      savePending.current = false;
      if (!updateError) {
        setEditing(false);
      }
    }
  }, [isUpdating, updateError]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  const handleSave = () => {
    const trimmed = draft.trim();
    savePending.current = true;
    onUpdateNotes(entry.id, trimmed || null);
  };

  const handleCancel = () => {
    setDraft(entry.notes ?? '');
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave();
    } else if (e.key === 'Escape' && !isUpdating) {
      handleCancel();
    }
  };

  return (
    <div className="flex gap-4 p-3 rounded-lg border" role="listitem">
      {showReorderControls && (
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
      )}

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

      <div className="flex-1 min-w-0">
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

        {editing ? (
          <div className="mt-1.5 space-y-1">
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a note..."
              rows={2}
              maxLength={500}
              aria-label={`Notes for ${title}`}
              className="text-xs min-h-0 resize-none"
            />
            <div className="flex items-center gap-2">
              <Button
                variant="link"
                size="sm"
                onClick={handleSave}
                disabled={isUpdating}
                aria-label="Save note"
                className="text-xs text-primary"
              >
                {isUpdating ? 'Saving...' : 'Save'}
              </Button>
              <Button
                variant="link"
                size="sm"
                onClick={handleCancel}
                disabled={isUpdating}
                aria-label="Cancel editing"
                className="text-xs text-muted-foreground"
              >
                Cancel
              </Button>
              <span className="text-xs text-muted-foreground ml-auto">
                {draft.length}/500 · Ctrl+Enter to save
              </span>
            </div>
            {updateError && <p className="text-xs text-destructive">{updateError}</p>}
          </div>
        ) : entry.notes ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            aria-label={`Edit notes for ${title}`}
            className="mt-1.5 text-xs text-muted-foreground line-clamp-2 text-left hover:text-foreground justify-start"
          >
            {entry.notes}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            aria-label={`Add notes for ${title}`}
            className="mt-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground"
          >
            Add note...
          </Button>
        )}
      </div>
    </div>
  );
}
