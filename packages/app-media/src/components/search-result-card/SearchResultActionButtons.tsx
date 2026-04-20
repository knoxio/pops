import { Bookmark, Check, Eye, Loader2, Plus } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

import { WatchlistToggle } from '../WatchlistToggle';

import type { SearchResultType } from '../SearchResultCard';

export interface InLibraryActionButtonsProps {
  type: SearchResultType;
  mediaId?: number;
  onMarkWatched?: () => void;
  isMarkingWatched?: boolean;
}

export function InLibraryActionButtons({
  type,
  mediaId,
  onMarkWatched,
  isMarkingWatched,
}: InLibraryActionButtonsProps) {
  return (
    <>
      <Badge variant="secondary" className="gap-1">
        <Check className="h-3 w-3" />
        In Library
      </Badge>
      {mediaId != null && (
        <WatchlistToggle mediaType={type} mediaId={mediaId} className="h-7 text-xs" />
      )}
      {type === 'movie' && mediaId != null && onMarkWatched != null && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          onClick={onMarkWatched}
          disabled={isMarkingWatched}
          aria-label="Mark as watched"
        >
          {isMarkingWatched ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
          {isMarkingWatched ? 'Logging\u2026' : 'Mark Watched'}
        </Button>
      )}
    </>
  );
}

export interface NotInLibraryActionButtonsProps {
  type: SearchResultType;
  addDisabled?: boolean;
  addDisabledReason?: string;
  isAdding?: boolean;
  onAdd?: () => void;
  onAddToWatchlistAndLibrary?: () => void;
  isAddingToWatchlistAndLibrary?: boolean;
  onMarkWatchedAndLibrary?: () => void;
  isMarkingWatchedAndLibrary?: boolean;
}

function AddToLibraryBtn({
  addDisabled,
  addDisabledReason,
  isAdding,
  onAdd,
}: Pick<
  NotInLibraryActionButtonsProps,
  'addDisabled' | 'addDisabledReason' | 'isAdding' | 'onAdd'
>) {
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 gap-1 text-xs"
      disabled={addDisabled ?? isAdding}
      title={addDisabledReason}
      onClick={onAdd}
    >
      {isAdding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
      {isAdding ? 'Adding\u2026' : 'Add to Library'}
    </Button>
  );
}

function WatchlistAndLibraryBtn({
  onAddToWatchlistAndLibrary,
  isAdding,
  isAddingToWatchlistAndLibrary,
}: Pick<
  NotInLibraryActionButtonsProps,
  'onAddToWatchlistAndLibrary' | 'isAdding' | 'isAddingToWatchlistAndLibrary'
>) {
  if (onAddToWatchlistAndLibrary == null) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 gap-1 text-xs"
      onClick={onAddToWatchlistAndLibrary}
      disabled={isAdding ?? isAddingToWatchlistAndLibrary}
      aria-label="Add to watchlist and library"
    >
      {isAddingToWatchlistAndLibrary ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Bookmark className="h-3 w-3" />
      )}
      {isAddingToWatchlistAndLibrary ? 'Adding\u2026' : 'Watchlist + Library'}
    </Button>
  );
}

function WatchedAndLibraryBtn({
  type,
  onMarkWatchedAndLibrary,
  isAdding,
  isMarkingWatchedAndLibrary,
}: Pick<
  NotInLibraryActionButtonsProps,
  'type' | 'onMarkWatchedAndLibrary' | 'isAdding' | 'isMarkingWatchedAndLibrary'
>) {
  if (type !== 'movie' || onMarkWatchedAndLibrary == null) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 gap-1 text-xs"
      onClick={onMarkWatchedAndLibrary}
      disabled={isAdding ?? isMarkingWatchedAndLibrary}
      aria-label="Mark as watched and add to library"
    >
      {isMarkingWatchedAndLibrary ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Eye className="h-3 w-3" />
      )}
      {isMarkingWatchedAndLibrary ? 'Logging\u2026' : 'Watched + Library'}
    </Button>
  );
}

export function NotInLibraryActionButtons(props: NotInLibraryActionButtonsProps) {
  return (
    <>
      <AddToLibraryBtn {...props} />
      <WatchlistAndLibraryBtn {...props} />
      <WatchedAndLibraryBtn {...props} />
    </>
  );
}
