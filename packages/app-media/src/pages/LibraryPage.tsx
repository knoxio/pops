import { useSearchParams, Link } from "react-router";
import { Badge, Button, Skeleton } from "@pops/ui";
import { useEffect } from "react";
import { Sparkles, Settings } from "lucide-react";
import { MediaGrid } from "../components/MediaGrid";
import { DownloadQueue } from "../components/DownloadQueue";
import { QuickPickDialog } from "../components/QuickPickDialog";
import {
  useMediaLibrary,
  type MediaType,
  type SortOption,
} from "../hooks/useMediaLibrary";

const TYPE_OPTIONS: { value: MediaType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "TV Shows" },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "dateAdded", label: "Date Added" },
  { value: "title", label: "Title (A-Z)" },
  { value: "releaseDate", label: "Release Date" },
  { value: "rating", label: "Rating" },
];

function LibrarySkeleton() {
  return (
    <MediaGrid>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-[2/3] w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </MediaGrid>
  );
}

function MediaCard({
  item,
}: {
  item: {
    id: number;
    type: "movie" | "tv";
    title: string;
    year: number | null;
    posterUrl: string | null;
    progress: number | null;
  };
}) {
  const href =
    item.type === "movie" ? `/media/movies/${item.id}` : `/media/tv/${item.id}`;
  const posterSrc = item.posterUrl ?? "";

  return (
    <Link to={href} className="group block outline-none">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted transition-all duration-300 group-hover:shadow-[0_0_20px_-5px_rgba(99,102,241,0.4)] group-hover:ring-1 group-hover:ring-indigo-500/30 group-focus-visible:ring-2 group-focus-visible:ring-indigo-500">
        {posterSrc ? (
          <img
            src={posterSrc}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-muted/50">
            No Poster
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <Badge
          variant="secondary"
          className="absolute top-2 right-2 text-[10px] uppercase tracking-wider px-1.5 py-0 bg-indigo-500/10 text-indigo-200 border-indigo-500/20 backdrop-blur-md"
        >
          {item.type === "movie" ? "Movie" : "TV"}
        </Badge>
        {/* Progress bar for TV shows */}
        {item.progress != null && item.progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
            <div
              className={`h-full transition-all ${item.progress >= 100 ? "bg-green-500" : "bg-indigo-500"}`}
              style={{ width: `${Math.min(item.progress, 100)}%` }}
            />
          </div>
        )}
      </div>
      <h3 className="mt-2 text-sm font-medium line-clamp-2 transition-colors group-hover:text-indigo-400">
        {item.title}
      </h3>
      {item.year && (
        <p className="text-xs text-muted-foreground">{item.year}</p>
      )}
    </Link>
  );
}

export function LibraryPage() {
  const [searchParams] = useSearchParams();
  const genreParam = searchParams.get("genre");

  const {
    items,
    isLoading,
    isEmpty,
    allGenres,
    typeFilter,
    setTypeFilter,
    genreFilter,
    setGenreFilter,
    sortBy,
    setSortBy,
  } = useMediaLibrary();

  useEffect(() => {
    if (genreParam) {
      setGenreFilter(genreParam);
    }
  }, [genreParam, setGenreFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Library</h1>
        <div className="flex items-center gap-3">
          <QuickPickDialog />
          <Link to="/media/quick-pick">
            <Button variant="outline" size="sm">
              <Sparkles className="h-4 w-4 mr-1.5" />
              Quick Pick
            </Button>
          </Link>
          <Link to="/media/plex">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-1.5" />
              Plex
            </Button>
          </Link>
          <Link to="/media/arr">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-1.5" />
              Arr
            </Button>
          </Link>
          <Link
            to="/media/search"
            className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Search
          </Link>
        </div>
      </div>

      {/* Download queue */}
      <DownloadQueue />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type toggle */}
        <div
          className="flex rounded-lg border bg-muted/30 p-0.5"
          role="group"
          aria-label="Filter by type"
        >
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTypeFilter(opt.value)}
              aria-pressed={typeFilter === opt.value}
              className={`px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-md transition-all duration-200 ${
                typeFilter === opt.value
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Genre dropdown */}
        {allGenres.length > 0 && (
          <select
            value={genreFilter ?? ""}
            onChange={(e) => setGenreFilter(e.target.value || null)}
            aria-label="Filter by genre"
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">All Genres</option>
            {allGenres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
        )}

        {/* Sort dropdown */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          aria-label="Sort by"
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <LibrarySkeleton />
      ) : isEmpty ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">
            Your library is empty. Search for movies and shows to get started.
          </p>
          <Link
            to="/media/search"
            className="mt-4 inline-block text-sm text-primary underline"
          >
            Search for media
          </Link>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">
            No results match your filters.
          </p>
        </div>
      ) : (
        <MediaGrid>
          {items.map((item) => (
            <MediaCard key={`${item.type}-${item.id}`} item={item} />
          ))}
        </MediaGrid>
      )}

      {/* Quick Pick FAB */}
      <Link
        to="/media/quick-pick"
        className="fixed bottom-6 right-6 z-50"
        aria-label="What should I watch tonight?"
      >
        <Button className="h-14 w-14 rounded-full bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/25 p-0">
          <Sparkles className="h-6 w-6" />
        </Button>
      </Link>
    </div>
  );
}
