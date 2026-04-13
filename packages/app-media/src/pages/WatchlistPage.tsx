/**
 * WatchlistPage — displays the user's watchlist with reorder controls and inline notes.
 *
 * Items are ordered by priority (lower = higher in list).
 * Mobile: compact list with up/down reorder buttons.
 * Desktop (md+): responsive poster card grid with priority badges.
 */
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DraggableAttributes,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Alert, AlertDescription, AlertTitle, Badge, Skeleton, Textarea } from '@pops/ui';
import { Button } from '@pops/ui';
import { ArrowDown, ArrowUp, Film, GripVertical, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { trpc } from '../lib/trpc';

type WatchlistFilter = 'all' | 'movie' | 'tv_show';

const FILTER_OPTIONS: { value: WatchlistFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv_show', label: 'TV Shows' },
];

function parseTypeParam(param: string | null): WatchlistFilter {
  if (param === 'movie' || param === 'tv_show') return param;
  return 'all';
}

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

interface MediaMeta {
  title: string;
  year: number | null;
  posterUrl: string | null;
}

function WatchlistSkeleton() {
  return (
    <>
      {/* Mobile skeleton */}
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 p-3 rounded-lg border">
            <Skeleton className="w-16 aspect-[2/3] rounded shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
      {/* Desktop skeleton */}
      <div className="hidden md:grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="w-full aspect-[2/3] rounded-md" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </>
  );
}

interface WatchlistItemProps {
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

function WatchlistItem({
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
}: WatchlistItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.notes ?? '');
  const savePending = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const href =
    entry.mediaType === 'movie' ? `/media/movies/${entry.mediaId}` : `/media/tv/${entry.mediaId}`;
  // Sync draft when server data changes
  useEffect(() => {
    if (!editing) {
      setDraft(entry.notes ?? '');
    }
  }, [entry.notes, editing]);

  // Close editor only on success, keep open on error
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
      {/* Reorder controls (hidden for single-item lists) */}
      {showReorderControls && (
        <div className="flex flex-col justify-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            disabled={isFirst || isReordering}
            onClick={onMoveUp}
            aria-label={`Move ${title} up`}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
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
            </div>
          </div>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
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
                className="text-xs h-auto p-0 text-primary"
              >
                {isUpdating ? 'Saving...' : 'Save'}
              </Button>
              <Button
                variant="link"
                size="sm"
                onClick={handleCancel}
                disabled={isUpdating}
                aria-label="Cancel editing"
                className="text-xs h-auto p-0 text-muted-foreground"
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
            onClick={() => setEditing(true)}
            aria-label={`Edit notes for ${title}`}
            className="mt-1.5 text-xs text-muted-foreground line-clamp-2 text-left hover:text-foreground h-auto p-0 justify-start"
          >
            {entry.notes}
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={() => setEditing(true)}
            aria-label={`Add notes for ${title}`}
            className="mt-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground h-auto p-0"
          >
            Add note...
          </Button>
        )}
      </div>
    </div>
  );
}

interface WatchlistCardProps {
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

function WatchlistCard({
  entry,
  title,
  year,
  posterUrl,
  priority,
  onRemove,
  isRemoving,
  dragAttributes,
  dragListeners,
}: WatchlistCardProps) {
  const navigate = useNavigate();
  const [imageError, setImageError] = useState(false);

  const href =
    entry.mediaType === 'movie' ? `/media/movies/${entry.mediaId}` : `/media/tv/${entry.mediaId}`;
  const posterSrc = posterUrl;

  return (
    <div className="group flex flex-col gap-2">
      {/* Poster */}
      <div
        role="button"
        tabIndex={0}
        className="relative w-full overflow-hidden rounded-md bg-muted aspect-[2/3] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => navigate(href)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate(href);
          }
        }}
      >
        {/* Priority badge */}
        <div className="absolute top-2 left-2 z-10 bg-primary text-primary-foreground text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center">
          #{priority}
        </div>

        {/* Grab handle (desktop hover) */}
        {dragListeners && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Drag to reorder ${title}`}
            className="absolute top-2 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white rounded-md p-1 h-auto w-auto cursor-grab active:cursor-grabbing hover:bg-black/80"
            onClick={(e) => e.stopPropagation()}
            {...dragListeners}
            {...dragAttributes}
          >
            <GripVertical className="h-4 w-4" />
          </Button>
        )}

        {/* Type badge */}
        <Badge
          variant={entry.mediaType === 'movie' ? 'default' : 'secondary'}
          className="absolute top-2 right-2 z-10"
        >
          {entry.mediaType === 'movie' ? 'Movie' : 'TV'}
        </Badge>

        {/* Remove button (hover) */}
        <Button
          variant="destructive"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(entry.id);
          }}
          disabled={isRemoving}
          aria-label={`Remove ${title} from watchlist`}
          className="absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity h-auto w-auto p-1.5"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>

        {!posterSrc || imageError ? (
          <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
            <Film className="h-10 w-10 opacity-40" />
          </div>
        ) : (
          <img
            src={posterSrc}
            alt={`${title} poster`}
            loading="lazy"
            className="h-full w-full object-cover group-hover:opacity-80 transition-opacity"
            onError={() => setImageError(true)}
          />
        )}
      </div>

      {/* Title + year + notes */}
      <div className="space-y-0.5 px-0.5">
        <Link to={href} className="hover:underline">
          <h3 className="text-sm font-medium leading-tight line-clamp-2">{title}</h3>
        </Link>
        {year && <p className="text-xs text-muted-foreground">{year}</p>}
        {entry.notes && <p className="text-xs text-muted-foreground line-clamp-1">{entry.notes}</p>}
      </div>
    </div>
  );
}

function SortableWatchlistCard(props: WatchlistCardProps) {
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

export function WatchlistPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = parseTypeParam(searchParams.get('type'));
  const [isReordering, setIsReordering] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [updateErrorId, setUpdateErrorId] = useState<number | null>(null);
  const [updateErrorMsg, setUpdateErrorMsg] = useState<string | null>(null);
  const [optimisticOrder, setOptimisticOrder] = useState<WatchlistEntry[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);

  const setFilter = useCallback(
    (value: WatchlistFilter) => {
      setSearchParams(value === 'all' ? {} : { type: value }, { replace: true });
    },
    [setSearchParams]
  );

  const {
    data: watchlistData,
    isLoading,
    error: watchlistError,
  } = trpc.media.watchlist.list.useQuery({
    ...(filter !== 'all' ? { mediaType: filter } : {}),
    limit: 500,
  });

  const { data: moviesData, isLoading: moviesLoading } = trpc.media.movies.list.useQuery({
    limit: 500,
  });

  const { data: tvShowsData, isLoading: tvShowsLoading } = trpc.media.tvShows.list.useQuery({
    limit: 500,
  });

  const utils = trpc.useUtils();

  const removeMutation = trpc.media.watchlist.remove.useMutation({
    onSuccess: () => {
      setRemovingId(null);
      toast.success('Removed from watchlist');
      void utils.media.watchlist.list.invalidate();
    },
    onError: (err: { message: string }) => {
      setRemovingId(null);
      toast.error(`Failed to remove: ${err.message}`);
    },
  });

  const updateMutation = trpc.media.watchlist.update.useMutation({
    onSuccess: () => {
      setUpdateErrorId(null);
      setUpdateErrorMsg(null);
      toast.success('Notes saved');
      void utils.media.watchlist.list.invalidate();
    },
    onError: (error: { message: string }) => {
      setUpdateErrorMsg(error.message ?? 'Failed to save notes');
      toast.error(`Failed to save notes: ${error.message}`);
    },
  });

  const reorderMutation = trpc.media.watchlist.reorder.useMutation({
    onSuccess: () => {
      setOptimisticOrder(null);
      void utils.media.watchlist.list.invalidate();
    },
    onError: (err: { message: string }) => {
      setOptimisticOrder(null);
      toast.error(`Failed to reorder: ${err.message}`);
    },
    onSettled: () => {
      setIsReordering(false);
    },
  });

  const loading = isLoading || moviesLoading || tvShowsLoading;
  const entries = watchlistData?.data ?? [];

  // Build lookup maps for movie/TV metadata (memoized)
  const movieMap = useMemo(
    () =>
      new Map<number, MediaMeta>(
        (moviesData?.data ?? []).map(
          (m: {
            id: number;
            title: string;
            releaseDate: string | null;
            posterUrl: string | null;
          }) => [
            m.id,
            {
              title: m.title,
              year: m.releaseDate ? new Date(m.releaseDate).getFullYear() : null,
              posterUrl: m.posterUrl,
            },
          ]
        )
      ),
    [moviesData?.data]
  );

  const tvMap = useMemo(
    () =>
      new Map<number, MediaMeta>(
        (tvShowsData?.data ?? []).map(
          (s: {
            id: number;
            name: string;
            firstAirDate: string | null;
            posterUrl: string | null;
          }) => [
            s.id,
            {
              title: s.name,
              year: s.firstAirDate ? new Date(s.firstAirDate).getFullYear() : null,
              posterUrl: s.posterUrl,
            },
          ]
        )
      ),
    [tvShowsData?.data]
  );

  // Use optimistic order during drag, otherwise server order
  const sortedEntries = optimisticOrder ?? entries;
  const hasManyItems = sortedEntries.length >= 2;

  const handleMove = useCallback(
    (index: number, direction: 'up' | 'down') => {
      if (isReordering) return;
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= sortedEntries.length) return;

      // Build new priority list by swapping
      const reordered = [...sortedEntries];
      const [moved] = reordered.splice(index, 1);
      if (!moved) return;
      reordered.splice(newIndex, 0, moved);

      // Assign sequential priorities
      const items = reordered.map((entry: WatchlistEntry, i: number) => ({
        id: entry.id,
        priority: i,
      }));

      setIsReordering(true);
      reorderMutation.mutate({ items });
    },
    [sortedEntries, reorderMutation, isReordering]
  );

  // Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(event.active.id as number);
      // Snapshot current order for potential revert
      setOptimisticOrder([...sortedEntries]);
    },
    [sortedEntries]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over || active.id === over.id) {
        // Cancelled or dropped on same spot — revert without API call
        setOptimisticOrder(null);
        return;
      }

      const currentOrder = optimisticOrder ?? sortedEntries;
      const oldIndex = currentOrder.findIndex((e) => e.id === active.id);
      const newIndex = currentOrder.findIndex((e) => e.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        setOptimisticOrder(null);
        return;
      }

      const reordered = arrayMove(currentOrder, oldIndex, newIndex) as WatchlistEntry[];
      setOptimisticOrder(reordered);

      const items = reordered.map((entry: WatchlistEntry, i: number) => ({
        id: entry.id,
        priority: i,
      }));
      setIsReordering(true);
      reorderMutation.mutate({ items });
    },
    [sortedEntries, optimisticOrder, reorderMutation]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setOptimisticOrder(null);
  }, []);

  const getMetaForEntry = useCallback(
    (entry: WatchlistEntry) => {
      const mapMeta =
        entry.mediaType === 'movie' ? movieMap.get(entry.mediaId) : tvMap.get(entry.mediaId);
      // Fall back to API-provided title/poster if map lookup fails
      if (mapMeta) return mapMeta;
      if (entry.title) {
        return {
          title: entry.title,
          posterUrl: entry.posterUrl ?? null,
          year: null,
        };
      }
      return undefined;
    },
    [movieMap, tvMap]
  );

  if (watchlistError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load watchlist. Please try again.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Watchlist</h1>

      {/* Filter tabs */}
      <div className="flex gap-2" role="tablist" aria-label="Filter watchlist">
        {FILTER_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={filter === opt.value ? 'default' : 'secondary'}
            size="sm"
            role="tab"
            aria-selected={filter === opt.value}
            onClick={() => setFilter(opt.value)}
            shape="pill"
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <WatchlistSkeleton />
      ) : entries.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">
            {filter === 'all'
              ? 'Your watchlist is empty. Browse your library or search for something to watch.'
              : filter === 'movie'
                ? 'No movies on your watchlist.'
                : 'No TV shows on your watchlist.'}
          </p>
          <div className="flex justify-center gap-4 mt-4">
            <Link to="/media" className="text-sm text-primary underline">
              Browse library
            </Link>
            <Link to="/media/search" className="text-sm text-primary underline">
              Search
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile: compact list with reorder */}
          <div className="space-y-3 md:hidden" role="list" aria-label="Watchlist items">
            {sortedEntries.map((entry: WatchlistEntry, index: number) => {
              const meta = getMetaForEntry(entry);

              return (
                <WatchlistItem
                  key={entry.id}
                  entry={entry}
                  title={meta?.title ?? 'Unknown'}
                  year={meta?.year ?? null}
                  posterUrl={meta?.posterUrl ?? null}
                  priority={index + 1}
                  isFirst={index === 0}
                  isLast={index === sortedEntries.length - 1}
                  onMoveUp={() => handleMove(index, 'up')}
                  onMoveDown={() => handleMove(index, 'down')}
                  onRemove={(id) => {
                    setRemovingId(id);
                    removeMutation.mutate({ id });
                  }}
                  isRemoving={removingId === entry.id}
                  isReordering={isReordering}
                  showReorderControls={hasManyItems}
                  onUpdateNotes={(id, notes) => {
                    setUpdateErrorId(id);
                    setUpdateErrorMsg(null);
                    updateMutation.mutate({ id, data: { notes } });
                  }}
                  isUpdating={updateMutation.isPending && updateMutation.variables?.id === entry.id}
                  updateError={updateErrorId === entry.id ? updateErrorMsg : null}
                />
              );
            })}
          </div>

          {/* Desktop: poster card grid with drag-and-drop */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={sortedEntries.map((e: WatchlistEntry) => e.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="hidden md:grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {sortedEntries.map((entry: WatchlistEntry, index: number) => {
                  const meta = getMetaForEntry(entry);

                  return hasManyItems ? (
                    <SortableWatchlistCard
                      key={entry.id}
                      entry={entry}
                      title={meta?.title ?? 'Unknown'}
                      year={meta?.year ?? null}
                      posterUrl={meta?.posterUrl ?? null}
                      priority={index + 1}
                      onRemove={(id) => {
                        setRemovingId(id);
                        removeMutation.mutate({ id });
                      }}
                      isRemoving={removingId === entry.id}
                    />
                  ) : (
                    <WatchlistCard
                      key={entry.id}
                      entry={entry}
                      title={meta?.title ?? 'Unknown'}
                      year={meta?.year ?? null}
                      posterUrl={meta?.posterUrl ?? null}
                      priority={index + 1}
                      onRemove={(id) => {
                        setRemovingId(id);
                        removeMutation.mutate({ id });
                      }}
                      isRemoving={removingId === entry.id}
                    />
                  );
                })}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeId != null
                ? (() => {
                    const entry = sortedEntries.find((e: WatchlistEntry) => e.id === activeId);
                    if (!entry) return null;
                    const meta = getMetaForEntry(entry);
                    const idx = sortedEntries.findIndex((e: WatchlistEntry) => e.id === activeId);
                    return (
                      <div className="opacity-80 w-48">
                        <WatchlistCard
                          entry={entry}
                          title={meta?.title ?? 'Unknown'}
                          year={meta?.year ?? null}
                          posterUrl={meta?.posterUrl ?? null}
                          priority={idx + 1}
                          onRemove={() => {}}
                          isRemoving={false}
                        />
                      </div>
                    );
                  })()
                : null}
            </DragOverlay>
          </DndContext>
        </>
      )}
    </div>
  );
}
