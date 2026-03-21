import { useMemo, useState } from "react";
import { trpc } from "../lib/trpc";

export type MediaType = "all" | "movie" | "tv";
export type SortOption = "title" | "dateAdded" | "releaseDate" | "rating";

interface MediaItem {
  id: number;
  type: "movie" | "tv";
  title: string;
  year: number | null;
  posterUrl: string | null;
  genres: string[];
  voteAverage: number | null;
  createdAt: string;
  releaseDate: string | null;
}

export function useMediaLibrary() {
  const [typeFilter, setTypeFilter] = useState<MediaType>("all");
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("dateAdded");

  const {
    data: moviesData,
    isLoading: moviesLoading,
  } = trpc.media.movies.list.useQuery({ limit: 500 });

  const {
    data: tvShowsData,
    isLoading: tvShowsLoading,
  } = trpc.media.tvShows.list.useQuery({ limit: 500 });

  const isLoading = moviesLoading || tvShowsLoading;

  const allItems = useMemo<MediaItem[]>(() => {
    const movies: MediaItem[] = (moviesData?.data ?? []).map((m) => ({
      id: m.id,
      type: "movie" as const,
      title: m.title,
      year: m.releaseDate ? new Date(m.releaseDate).getFullYear() : null,
      posterUrl: m.posterUrl,
      genres: m.genres,
      voteAverage: m.voteAverage,
      createdAt: m.createdAt,
      releaseDate: m.releaseDate,
    }));

    const shows: MediaItem[] = (tvShowsData?.data ?? []).map((s) => ({
      id: s.id,
      type: "tv" as const,
      title: s.name,
      year: s.firstAirDate ? new Date(s.firstAirDate).getFullYear() : null,
      posterUrl: s.posterUrl,
      genres: s.genres,
      voteAverage: s.voteAverage,
      createdAt: s.createdAt,
      releaseDate: s.firstAirDate,
    }));

    return [...movies, ...shows];
  }, [moviesData, tvShowsData]);

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
  }, [allItems, typeFilter, genreFilter, sortBy]);

  return {
    items: filteredItems,
    isLoading,
    isEmpty: !isLoading && allItems.length === 0,
    allGenres,
    typeFilter,
    setTypeFilter,
    genreFilter,
    setGenreFilter,
    sortBy,
    setSortBy,
  };
}
