/**
 * WatchlistPage — displays the user's watchlist with reorder controls and inline notes.
 *
 * Items are ordered by priority (lower = higher in list).
 * Mobile: compact list with up/down reorder buttons.
 * Desktop (md+): responsive poster card grid with priority badges.
 */
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  Badge,
  Skeleton,
  Textarea,
} from "@pops/ui";
import { Button } from "@pops/ui";
import { ArrowUp, ArrowDown, Trash2, Film } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";

interface WatchlistEntry {
  id: number;
  mediaType: string;
  mediaId: number;
  priority: number | null;
  notes: string | null;
  addedAt: string;
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
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: (id: number) => void;
  isRemoving: boolean;
  isReordering: boolean;
  onUpdateNotes: (id: number, notes: string | null) => void;
  isUpdating: boolean;
  updateError: string | null;
}

function WatchlistItem({
  entry,
  title,
  year,
  posterUrl,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
  isRemoving,
  isReordering,
  onUpdateNotes,
  isUpdating,
  updateError,
}: WatchlistItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.notes ?? "");
  const savePending = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const href =
    entry.mediaType === "movie"
      ? `/media/movies/${entry.mediaId}`
      : `/media/tv/${entry.mediaId}`;
  const posterSrc = posterUrl ?? "";

  // Sync draft when server data changes
  useEffect(() => {
    if (!editing) {
      setDraft(entry.notes ?? "");
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
    setDraft(entry.notes ?? "");
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSave();
    } else if (e.key === "Escape" && !isUpdating) {
      handleCancel();
    }
  };

  return (
    <div className="flex gap-4 p-3 rounded-lg border" role="listitem">
      {/* Reorder controls */}
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

      <Link to={href} className="shrink-0">
        <img
          src={posterSrc}
          alt={`${title} poster`}
          className="w-16 aspect-[2/3] rounded object-cover bg-muted"
          loading="lazy"
        />
      </Link>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={href} className="hover:underline">
              <h3 className="text-sm font-medium truncate">{title}</h3>
            </Link>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="secondary" className="text-xs">
                {entry.mediaType === "movie" ? "Movie" : "TV"}
              </Badge>
              {year && (
                <span className="text-xs text-muted-foreground">{year}</span>
              )}
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
              <button
                type="button"
                onClick={handleSave}
                disabled={isUpdating}
                aria-label="Save note"
                className="text-xs text-primary hover:underline disabled:opacity-50"
              >
                {isUpdating ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isUpdating}
                aria-label="Cancel editing"
                className="text-xs text-muted-foreground hover:underline"
              >
                Cancel
              </button>
              <span className="text-xs text-muted-foreground ml-auto">
                {draft.length}/500 · Ctrl+Enter to save
              </span>
            </div>
            {updateError && (
              <p className="text-xs text-destructive">{updateError}</p>
            )}
          </div>
        ) : entry.notes ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit notes for ${title}`}
            className="mt-1.5 text-xs text-muted-foreground line-clamp-2 text-left hover:text-foreground transition-colors cursor-pointer"
          >
            {entry.notes}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Add notes for ${title}`}
            className="mt-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer"
          >
            Add note...
          </button>
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
}

function WatchlistCard({
  entry,
  title,
  year,
  posterUrl,
  priority,
  onRemove,
  isRemoving,
}: WatchlistCardProps) {
  const navigate = useNavigate();
  const [imageError, setImageError] = useState(false);

  const href =
    entry.mediaType === "movie"
      ? `/media/movies/${entry.mediaId}`
      : `/media/tv/${entry.mediaId}`;
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
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(href);
          }
        }}
      >
        {/* Priority badge */}
        <div className="absolute top-2 left-2 z-10 bg-primary text-primary-foreground text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center">
          #{priority}
        </div>

        {/* Type badge */}
        <Badge
          variant={entry.mediaType === "movie" ? "default" : "secondary"}
          className="absolute top-2 right-2 z-10"
        >
          {entry.mediaType === "movie" ? "Movie" : "TV"}
        </Badge>

        {/* Remove button (hover) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(entry.id);
          }}
          disabled={isRemoving}
          aria-label={`Remove ${title} from watchlist`}
          className="absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded-md p-1.5 hover:bg-destructive/90 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

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
          <h3 className="text-sm font-medium leading-tight line-clamp-2">
            {title}
          </h3>
        </Link>
        {year && <p className="text-xs text-muted-foreground">{year}</p>}
        {entry.notes && (
          <p className="text-xs text-muted-foreground line-clamp-1">
            {entry.notes}
          </p>
        )}
      </div>
    </div>
  );
}

export function WatchlistPage() {
  const [isReordering, setIsReordering] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [updateErrorId, setUpdateErrorId] = useState<number | null>(null);
  const [updateErrorMsg, setUpdateErrorMsg] = useState<string | null>(null);

  const {
    data: watchlistData,
    isLoading,
    error: watchlistError,
  } = trpc.media.watchlist.list.useQuery({ limit: 500 });

  const { data: moviesData, isLoading: moviesLoading } =
    trpc.media.movies.list.useQuery({ limit: 500 });

  const { data: tvShowsData, isLoading: tvShowsLoading } =
    trpc.media.tvShows.list.useQuery({ limit: 500 });

  const utils = trpc.useUtils();

  const removeMutation = trpc.media.watchlist.remove.useMutation({
    onSuccess: () => {
      setRemovingId(null);
      toast.success("Removed from watchlist");
      void utils.media.watchlist.list.invalidate();
    },
    onError: (err) => {
      setRemovingId(null);
      toast.error(`Failed to remove: ${err.message}`);
    },
  });

  const updateMutation = trpc.media.watchlist.update.useMutation({
    onSuccess: () => {
      setUpdateErrorId(null);
      setUpdateErrorMsg(null);
      toast.success("Notes saved");
      void utils.media.watchlist.list.invalidate();
    },
    onError: (error) => {
      setUpdateErrorMsg(error.message ?? "Failed to save notes");
      toast.error(`Failed to save notes: ${error.message}`);
    },
  });

  const reorderMutation = trpc.media.watchlist.reorder.useMutation({
    onSuccess: () => {
      void utils.media.watchlist.list.invalidate();
    },
    onError: (err: { message: string }) => {
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
              year: m.releaseDate
                ? new Date(m.releaseDate).getFullYear()
                : null,
              posterUrl: m.posterUrl,
            },
          ],
        ),
      ),
    [moviesData?.data],
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
              year: s.firstAirDate
                ? new Date(s.firstAirDate).getFullYear()
                : null,
              posterUrl: s.posterUrl,
            },
          ],
        ),
      ),
    [tvShowsData?.data],
  );

  // Already sorted by priority ASC from the API
  const sortedEntries = entries;

  const handleMove = useCallback(
    (index: number, direction: "up" | "down") => {
      if (isReordering) return;
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= sortedEntries.length) return;

      // Build new priority list by swapping
      const reordered = [...sortedEntries];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(newIndex, 0, moved);

      // Assign sequential priorities
      const items = reordered.map((entry: WatchlistEntry, i: number) => ({
        id: entry.id,
        priority: i,
      }));

      setIsReordering(true);
      reorderMutation.mutate({ items });
    },
    [sortedEntries, reorderMutation, isReordering],
  );

  if (watchlistError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load watchlist. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Watchlist</h1>

      {loading ? (
        <WatchlistSkeleton />
      ) : entries.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">
            Your watchlist is empty. Browse your library or search for something
            to watch.
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
          <div
            className="space-y-3 md:hidden"
            role="list"
            aria-label="Watchlist items"
          >
            {sortedEntries.map((entry: WatchlistEntry, index: number) => {
              const meta =
                entry.mediaType === "movie"
                  ? movieMap.get(entry.mediaId)
                  : tvMap.get(entry.mediaId);

              return (
                <WatchlistItem
                  key={entry.id}
                  entry={entry}
                  title={meta?.title ?? "Unknown"}
                  year={meta?.year ?? null}
                  posterUrl={meta?.posterUrl ?? null}
                  isFirst={index === 0}
                  isLast={index === sortedEntries.length - 1}
                  onMoveUp={() => handleMove(index, "up")}
                  onMoveDown={() => handleMove(index, "down")}
                  onRemove={(id) => {
                    setRemovingId(id);
                    removeMutation.mutate({ id });
                  }}
                  isRemoving={removingId === entry.id}
                  isReordering={isReordering}
                  onUpdateNotes={(id, notes) => {
                    setUpdateErrorId(id);
                    setUpdateErrorMsg(null);
                    updateMutation.mutate({ id, data: { notes } });
                  }}
                  isUpdating={
                    updateMutation.isPending &&
                    updateMutation.variables?.id === entry.id
                  }
                  updateError={
                    updateErrorId === entry.id ? updateErrorMsg : null
                  }
                />
              );
            })}
          </div>

          {/* Desktop: poster card grid */}
          <div className="hidden md:grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {sortedEntries.map((entry: WatchlistEntry, index: number) => {
              const meta =
                entry.mediaType === "movie"
                  ? movieMap.get(entry.mediaId)
                  : tvMap.get(entry.mediaId);

              return (
                <WatchlistCard
                  key={entry.id}
                  entry={entry}
                  title={meta?.title ?? "Unknown"}
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
        </>
      )}
    </div>
  );
}
