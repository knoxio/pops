import { useSearchParams, Link } from "react-router";
import { Badge, Skeleton } from "@pops/ui";
import { useEffect } from "react";
import { MediaGrid } from "@/components/MediaGrid";
import {
  useMediaLibrary,
  type MediaType,
  type SortOption,
} from "@/hooks/useMediaLibrary";

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
    posterPath: string | null;
  };
}) {
  const href =
    item.type === "movie"
      ? `/media/movies/${item.id}`
      : `/media/tv/${item.id}`;
  const posterSrc = `/media/images/${item.type === "movie" ? "movie" : "tv"}/${item.id}/poster.jpg`;

  return (
    <Link to={href} className="group block">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted">
        <img
          src={posterSrc}
          alt={item.title}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
        <Badge
          variant="secondary"
          className="absolute top-2 right-2 text-xs"
        >
          {item.type === "movie" ? "Movie" : "TV"}
        </Badge>
      </div>
      <h3 className="mt-2 text-sm font-medium line-clamp-2">{item.title}</h3>
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Library</h1>
        <Link
          to="/media/search"
          className="text-sm text-primary hover:underline"
        >
          Search
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type toggle */}
        <div className="flex rounded-lg border p-0.5">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTypeFilter(opt.value)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                typeFilter === opt.value
                  ? "bg-primary text-primary-foreground"
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
    </div>
  );
}
