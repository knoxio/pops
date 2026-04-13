/**
 * HistoryPage — watch history with filter tabs, pagination, and delete.
 *
 * Mobile: compact list. Desktop (md+): responsive poster card grid.
 * Each entry has a delete action with confirmation dialog.
 */
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  Skeleton,
} from '@pops/ui';
import { ClipboardCheck, Film, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { formatEpisodeCode } from '../lib/format';
import { trpc } from '../lib/trpc';

const PAGE_SIZE = 50;

type MediaTypeFilter = 'all' | 'movie' | 'episode';

const FILTER_OPTIONS: { value: MediaTypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'episode', label: 'Episodes' },
];

function formatWatchDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
  });
}

function HistorySkeleton() {
  return (
    <>
      {/* Mobile */}
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-3 p-3 rounded-lg border">
            <Skeleton className="w-12 aspect-[2/3] rounded shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
      {/* Desktop */}
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

interface HistoryEntry {
  id: number;
  mediaType: string;
  mediaId: number;
  watchedAt: string;
  title: string | null;
  posterPath: string | null;
  posterUrl: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  showName: string | null;
  tvShowId: number | null;
}

function getHistoryHref(entry: HistoryEntry): string {
  const isEpisode = entry.mediaType === 'episode';
  if (isEpisode && entry.tvShowId) {
    return `/media/tv/${entry.tvShowId}/season/${entry.seasonNumber}`;
  }
  if (isEpisode) return `/media`;
  return `/media/movies/${entry.mediaId}`;
}

function getHistoryPoster(entry: HistoryEntry): string | null {
  return entry.posterUrl ?? null;
}

function HistoryItem({
  entry,
  onDelete,
  isDeleting,
  debriefSessionId,
}: {
  entry: HistoryEntry;
  onDelete: (id: number) => void;
  isDeleting: boolean;
  debriefSessionId: number | null;
}) {
  const href = getHistoryHref(entry);
  const posterSrc = getHistoryPoster(entry);
  const isEpisode = entry.mediaType === 'episode';

  const title = entry.title ?? 'Unknown';
  const hasEpisodeInfo =
    isEpisode &&
    entry.showName != null &&
    entry.seasonNumber != null &&
    entry.episodeNumber != null;
  const episodeCode = hasEpisodeInfo
    ? formatEpisodeCode(entry.seasonNumber!, entry.episodeNumber!)
    : null;

  return (
    <div className="group flex gap-3 p-3 rounded-lg border">
      <Link to={href} className="shrink-0">
        {posterSrc ? (
          <img
            src={posterSrc}
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
            {hasEpisodeInfo && (
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
            )}
          </div>
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
              onClick={() => onDelete(entry.id)}
              className="p-1 h-auto w-auto hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Badge variant="secondary" className="text-xs">
              {isEpisode ? 'Episode' : 'Movie'}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{formatWatchDate(entry.watchedAt)}</p>
      </div>
    </div>
  );
}

function HistoryCard({
  entry,
  onDelete,
  isDeleting,
  debriefSessionId,
}: {
  entry: HistoryEntry;
  onDelete: (id: number) => void;
  isDeleting: boolean;
  debriefSessionId: number | null;
}) {
  const navigate = useNavigate();
  const [imageError, setImageError] = useState(false);
  const href = getHistoryHref(entry);
  const posterSrc = getHistoryPoster(entry);
  const isEpisode = entry.mediaType === 'episode';

  const title = entry.title ?? 'Unknown';
  const hasEpisodeInfo =
    isEpisode &&
    entry.showName != null &&
    entry.seasonNumber != null &&
    entry.episodeNumber != null;
  const episodeCode = hasEpisodeInfo
    ? formatEpisodeCode(entry.seasonNumber!, entry.episodeNumber!)
    : null;

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
            navigate(href);
          }
        }}
      >
        {/* Type badge */}
        <Badge variant={isEpisode ? 'secondary' : 'default'} className="absolute top-2 left-2 z-10">
          {isEpisode ? 'Episode' : 'Movie'}
        </Badge>

        {/* Watch date badge */}
        <span className="absolute top-2 right-2 z-10 bg-black/60 text-white text-2xs font-medium px-1.5 py-0.5 rounded">
          {formatShortDate(entry.watchedAt)}
        </span>

        {/* Debrief button — visible on hover when pending */}
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

        {/* Delete button — visible on hover */}
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

      <div className="space-y-0.5 px-0.5">
        <Link to={href} className="hover:underline">
          <h3 className="text-sm font-medium leading-tight line-clamp-2">{title}</h3>
        </Link>
        {hasEpisodeInfo ? (
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
        ) : null}
      </div>
    </div>
  );
}

export function HistoryPage() {
  const [filter, setFilter] = useState<MediaTypeFilter>('all');
  const [offset, setOffset] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const queryInput = {
    ...(filter !== 'all' ? { mediaType: filter as 'movie' | 'episode' } : {}),
    limit: PAGE_SIZE,
    offset,
  };

  const { data, isLoading, error } = trpc.media.watchHistory.listRecent.useQuery(queryInput);
  const { data: pendingDebriefs } = trpc.media.comparisons.getPendingDebriefs.useQuery();

  const debriefByMovieId = useMemo(() => {
    const map = new Map<number, number>();
    for (const d of pendingDebriefs?.data ?? []) {
      map.set(d.movieId, d.sessionId);
    }
    return map;
  }, [pendingDebriefs]);

  const entries = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;
  const hasMore = offset + PAGE_SIZE < total;

  const deleteMutation = trpc.media.watchHistory.delete.useMutation({
    onSuccess: () => {
      toast.success('Watch event removed');
      void utils.media.watchHistory.listRecent.invalidate();
      void utils.media.watchHistory.list.invalidate();
      void utils.media.watchlist.list.invalidate();

      // If we just deleted the last entry on this page, go to previous page
      if (entries.length === 1 && offset > 0) {
        setOffset(Math.max(0, offset - PAGE_SIZE));
      }
    },
    onError: (err) => {
      toast.error(`Failed to delete watch event: ${err.message}`);
    },
  });

  const handleDeleteClick = useCallback((id: number) => {
    setDeleteTarget(id);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (deleteTarget === null) return;
    deleteMutation.mutate({ id: deleteTarget });
    setDeleteTarget(null);
  }, [deleteTarget, deleteMutation]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Watch History</h1>

      {/* Type filter tabs */}
      <div className="flex gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={filter === opt.value ? 'default' : 'secondary'}
            size="sm"
            onClick={() => {
              setFilter(opt.value);
              setOffset(0);
            }}
            shape="pill"
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : isLoading ? (
        <HistorySkeleton />
      ) : entries.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">
            {filter === 'all'
              ? 'No watch history yet. Start watching something!'
              : `No ${filter === 'movie' ? 'movies' : 'episodes'} in your history.`}
          </p>
          <Link to="/media" className="mt-4 inline-block text-sm text-primary underline">
            Browse library
          </Link>
        </div>
      ) : (
        <>
          {/* Mobile: compact list */}
          <div className="space-y-2 md:hidden">
            {entries.map((entry: HistoryEntry) => (
              <HistoryItem
                key={entry.id}
                entry={entry}
                onDelete={handleDeleteClick}
                isDeleting={deleteMutation.isPending}
                debriefSessionId={
                  entry.mediaType === 'movie' ? (debriefByMovieId.get(entry.mediaId) ?? null) : null
                }
              />
            ))}
          </div>

          {/* Desktop: poster card grid */}
          <div className="hidden md:grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {entries.map((entry: HistoryEntry) => (
              <HistoryCard
                key={entry.id}
                entry={entry}
                onDelete={handleDeleteClick}
                isDeleting={deleteMutation.isPending}
                debriefSessionId={
                  entry.mediaType === 'movie' ? (debriefByMovieId.get(entry.mediaId) ?? null) : null
                }
              />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {Math.min(offset + PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-2">
              {offset > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  Previous
                </Button>
              )}
              {hasMore && (
                <Button variant="outline" size="sm" onClick={() => setOffset(offset + PAGE_SIZE)}>
                  Next
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove watch event?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this entry from your watch history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
