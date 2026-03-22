import { useState } from "react";
import { Link } from "react-router";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  Badge,
  Button,
  Skeleton,
} from "@pops/ui";
import { trpc } from "../lib/trpc";

const PAGE_SIZE = 50;

type MediaTypeFilter = "all" | "movie" | "episode";

const FILTER_OPTIONS: { value: MediaTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "episode", label: "Episodes" },
];

function formatWatchDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HistorySkeleton() {
  return (
    <div className="space-y-3">
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
  );
}

interface HistoryItemProps {
  entry: {
    id: number;
    mediaType: string;
    mediaId: number;
    watchedAt: string;
    title: string | null;
    posterPath: string | null;
    seasonNumber: number | null;
    episodeNumber: number | null;
    showName: string | null;
    tvShowId: number | null;
  };
}

function HistoryItem({ entry }: HistoryItemProps) {
  const isEpisode = entry.mediaType === "episode";
  const href =
    isEpisode && entry.tvShowId
      ? `/media/tv/${entry.tvShowId}/season/${entry.seasonNumber}`
      : isEpisode
        ? `/media`
        : `/media/movies/${entry.mediaId}`;
  const posterSrc = entry.posterPath
    ? isEpisode && entry.tvShowId
      ? `/media/images/tv/${entry.tvShowId}/poster.jpg`
      : `/media/images/movie/${entry.mediaId}/poster.jpg`
    : null;

  const title = entry.title ?? "Unknown";
  const subtitle =
    isEpisode && entry.showName
      ? `${entry.showName} · S${entry.seasonNumber ?? "?"}E${entry.episodeNumber ?? "?"}`
      : null;

  return (
    <div className="flex gap-3 p-3 rounded-lg border">
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
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate">
                {subtitle}
              </p>
            )}
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">
            {isEpisode ? "Episode" : "Movie"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {formatWatchDate(entry.watchedAt)}
        </p>
      </div>
    </div>
  );
}

export function HistoryPage() {
  const [filter, setFilter] = useState<MediaTypeFilter>("all");
  const [offset, setOffset] = useState(0);

  const queryInput = {
    ...(filter !== "all" ? { mediaType: filter as "movie" | "episode" } : {}),
    limit: PAGE_SIZE,
    offset,
  };

  const { data, isLoading, error } =
    trpc.media.watchHistory.listRecent.useQuery(queryInput);

  const entries = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;
  const hasMore = offset + PAGE_SIZE < total;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Watch History</h1>

      {/* Type filter tabs */}
      <div className="flex gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              setFilter(opt.value);
              setOffset(0);
            }}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              filter === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {opt.label}
          </button>
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
            {filter === "all"
              ? "No watch history yet. Start watching something!"
              : `No ${filter === "movie" ? "movies" : "episodes"} in your history.`}
          </p>
          <Link
            to="/media"
            className="mt-4 inline-block text-sm text-primary underline"
          >
            Browse library
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {entries.map((entry) => (
              <HistoryItem key={entry.id} entry={entry} />
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
