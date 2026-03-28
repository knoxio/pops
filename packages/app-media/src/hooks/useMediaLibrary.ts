import { trpc } from "../lib/trpc";

export type MediaType = "all" | "movie" | "tv";
export type SortOption = "title" | "dateAdded" | "releaseDate" | "rating";

export interface MediaItem {
  id: number;
  type: "movie" | "tv";
  title: string;
  year: number | null;
  posterUrl: string | null;
  cdnPosterUrl: string | null;
  genres: string[];
  voteAverage: number | null;
  createdAt: string;
  releaseDate: string | null;
}

export interface UseMediaLibraryParams {
  typeFilter: MediaType;
  genreFilter: string | null;
  sortBy: SortOption;
  search: string;
  page: number;
  pageSize: number;
}

export function useMediaLibrary({
  typeFilter,
  genreFilter,
  sortBy,
  search,
  page,
  pageSize,
}: UseMediaLibraryParams) {
  const { data, isLoading, error, refetch } = trpc.media.library.list.useQuery({
    type: typeFilter,
    sort: sortBy,
    search: search || undefined,
    genre: genreFilter || undefined,
    page,
    pageSize,
  });

  const { data: genresData } = trpc.media.library.genres.useQuery();

  return {
    items: (data?.data ?? []) as MediaItem[],
    isLoading,
    error,
    refetch,
    isEmpty: !isLoading && !error && (data?.pagination.total ?? 0) === 0,
    allGenres: genresData?.data ?? [],
    pagination: data?.pagination ?? {
      page: 1,
      pageSize,
      total: 0,
      totalPages: 0,
      hasMore: false,
    },
  };
}
