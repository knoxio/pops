import { Link } from "react-router";
import { Alert, AlertTitle, AlertDescription, Badge, Skeleton } from "@pops/ui";
import { trpc } from "../lib/trpc";

function WatchlistSkeleton() {
  return (
    <div className="space-y-3">
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
  );
}

interface WatchlistItemProps {
  entry: {
    id: number;
    mediaType: string;
    mediaId: number;
    priority: number | null;
    notes: string | null;
    addedAt: string;
  };
  title: string;
  year: number | null;
  onRemove: (id: number) => void;
  isRemoving: boolean;
}

function WatchlistItem({
  entry,
  title,
  year,
  onRemove,
  isRemoving,
}: WatchlistItemProps) {
  const href =
    entry.mediaType === "movie"
      ? `/media/movies/${entry.mediaId}`
      : `/media/tv/${entry.mediaId}`;
  const posterSrc = `/media/images/${entry.mediaType === "movie" ? "movie" : "tv"}/${entry.mediaId}/poster.jpg`;

  return (
    <div className="flex gap-4 p-3 rounded-lg border">
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
              {entry.priority != null && entry.priority > 0 && (
                <span className="text-xs text-muted-foreground">
                  Priority: {entry.priority}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onRemove(entry.id)}
            disabled={isRemoving}
            aria-label={`Remove ${title} from watchlist`}
            className="text-xs text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-50"
          >
            Remove
          </button>
        </div>

        {entry.notes && (
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
            {entry.notes}
          </p>
        )}
      </div>
    </div>
  );
}

export function WatchlistPage() {
  const {
    data: watchlistData,
    isLoading,
    error,
  } = trpc.media.watchlist.list.useQuery({ limit: 500 });

  const {
    data: moviesData,
    isLoading: moviesLoading,
  } = trpc.media.movies.list.useQuery({ limit: 500 });

  const {
    data: tvShowsData,
    isLoading: tvShowsLoading,
  } = trpc.media.tvShows.list.useQuery({ limit: 500 });

  const utils = trpc.useUtils();
  const removeMutation = trpc.media.watchlist.remove.useMutation({
    onSuccess: () => {
      utils.media.watchlist.list.invalidate();
    },
  });

  const loading = isLoading || moviesLoading || tvShowsLoading;
  const entries = watchlistData?.data ?? [];

  // Build lookup maps for movie/TV metadata
  interface MediaMeta {
    title: string;
    year: number | null;
  }

  const movieMap = new Map<number, MediaMeta>(
    (moviesData?.data ?? []).map((m: { id: number; title: string; releaseDate: string | null }) => [
      m.id,
      {
        title: m.title,
        year: m.releaseDate ? new Date(m.releaseDate).getFullYear() : null,
      },
    ])
  );

  const tvMap = new Map<number, MediaMeta>(
    (tvShowsData?.data ?? []).map((s: { id: number; name: string; firstAirDate: string | null }) => [
      s.id,
      {
        title: s.name,
        year: s.firstAirDate
          ? new Date(s.firstAirDate).getFullYear()
          : null,
      },
    ])
  );

  // Sort by priority (higher first), then by addedAt (newest first)
  const sortedEntries = [...entries].sort((a, b) => {
    const aPriority = a.priority ?? 0;
    const bPriority = b.priority ?? 0;
    if (bPriority !== aPriority) return bPriority - aPriority;
    return b.addedAt.localeCompare(a.addedAt);
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Watchlist</h1>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : loading ? (
        <WatchlistSkeleton />
      ) : entries.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">
            Your watchlist is empty. Browse your library or search for something
            to watch.
          </p>
          <div className="flex justify-center gap-4 mt-4">
            <Link
              to="/media"
              className="text-sm text-primary underline"
            >
              Browse library
            </Link>
            <Link
              to="/media/search"
              className="text-sm text-primary underline"
            >
              Search
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedEntries.map((entry) => {
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
                onRemove={(id) => removeMutation.mutate({ id })}
                isRemoving={removeMutation.isPending}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
