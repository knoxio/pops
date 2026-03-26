import { useMemo } from "react";
import { trpc } from "../lib/trpc";

export type MediaType = "all" | "movie" | "tv";
export type SortOption = "title" | "dateAdded" | "releaseDate" | "rating";

export interface MediaItem {
  id: number;
  type: "movie" | "tv";
  title: string;
  year: number | null;
  posterUrl: string | null;
  genres: string[];
  voteAverage: number | null;
  createdAt: string;
  releaseDate: string | null;
  /** Watch progress percentage for TV shows (0–100). */
  progress: number | null;
}

export interface UseMediaLibraryParams {
  typeFilter: MediaType;
  genreFilter: string | null;
  sortBy: SortOption;
  search: string;
}

export function useMediaLibrary({
  typeFilter,
  genreFilter,
  sortBy,
  search,
}: UseMediaLibraryParams) {
  const { data: moviesData, isLoading: moviesLoading } = trpc.media.movies.list.useQuery({
    limit: 500,
  });

  const { data: tvShowsData, isLoading: tvShowsLoading } = trpc.media.tvShows.list.useQuery({
    limit: 500,
  });

  // Fetch batch progress for all TV shows
  const tvShowIds = useMemo(
    () => (tvShowsData?.data ?? []).map((s: { id: number }) => s.id),
    [tvShowsData]
  );

  const { data: progressData } = trpc.media.watchHistory.batchProgress.useQuery(
    { tvShowIds },
    { enabled: tvShowIds.length > 0 }
  );

  const isLoading = moviesLoading || tvShowsLoading;

  const allItems = useMemo<MediaItem[]>(() => {
    const progressMap = new Map(
      (progressData?.data ?? []).map((p: { tvShowId: number; percentage: number }) => [
        p.tvShowId,
        p.percentage,
      ])
    );

    const movieItems: MediaItem[] = (moviesData?.data ?? []).map(
      (m: {
        id: number;
        title: string;
        releaseDate: string | null;
        posterUrl: string | null;
        genres: string[];
        voteAverage: number | null;
        createdAt: string;
      }) => ({
        id: m.id,
        type: "movie" as const,
        title: m.title,
        year: m.releaseDate ? new Date(m.releaseDate).getFullYear() : null,
        posterUrl: m.posterUrl,
        genres: m.genres,
        voteAverage: m.voteAverage,
        createdAt: m.createdAt,
        releaseDate: m.releaseDate,
        progress: null,
      })
    );

    const shows: MediaItem[] = (tvShowsData?.data ?? []).map(
      (s: {
        id: number;
        name: string;
        firstAirDate: string | null;
        posterUrl: string | null;
        genres: string[];
        voteAverage: number | null;
        createdAt: string;
      }) => ({
        id: s.id,
        type: "tv" as const,
        title: s.name,
        year: s.firstAirDate ? new Date(s.firstAirDate).getFullYear() : null,
        posterUrl: s.posterUrl,
        genres: s.genres,
        voteAverage: s.voteAverage,
        createdAt: s.createdAt,
        releaseDate: s.firstAirDate,
        progress: progressMap.get(s.id) ?? null,
      })
    );

    return [...movieItems, ...shows];
  }, [moviesData, tvShowsData, progressData]);

  const allGenres = useMemo(() => {
    const genres = new Set<string>();
    allItems.forEach((item) => item.genres.forEach((g) => genres.add(g)));
    return Array.from(genres).sort();
  }, [allItems]);

  const filteredItems = useMemo(() => {
    let items = allItems;

    if (typeFilter !== "all") {
      items = items.filter((item) => item.type === typeFilter);
    }

    if (genreFilter) {
      items = items.filter((item) => item.genres.includes(genreFilter));
    }

    if (search) {
      const q = search.toLowerCase();
      items = items.filter((item) => item.title.toLowerCase().includes(q));
    }

    return [...items].sort((a, b) => {
      switch (sortBy) {
        case "title":
          return a.title.localeCompare(b.title);
        case "dateAdded":
          return b.createdAt.localeCompare(a.createdAt);
        case "releaseDate":
          return (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "");
        case "rating":
          return (b.voteAverage ?? 0) - (a.voteAverage ?? 0);
        default:
          return 0;
      }
    });
  }, [allItems, typeFilter, genreFilter, sortBy, search]);

  return {
    items: filteredItems,
    isLoading,
    isEmpty: !isLoading && allItems.length === 0,
    allGenres,
  };
}
