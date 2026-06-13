import { usePillarQuery } from '@pops/pillar-sdk/react';

export type MediaType = 'all' | 'movie' | 'tv';
export type SortOption = 'title' | 'dateAdded' | 'releaseDate' | 'rating';

export interface MediaItem {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterUrl: string | null;
  cdnPosterUrl: string | null;
  genres: string[];
  voteAverage: number | null;
  createdAt: string;
  releaseDate: string | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

interface LibraryListResult {
  data: MediaItem[];
  pagination: Pagination;
}

interface GenresResult {
  data: string[];
}

export interface UseMediaLibraryParams {
  typeFilter: MediaType;
  genreFilter: string | null;
  sortBy: SortOption;
  search: string;
  page: number;
  pageSize: number;
}

function buildEmptyPagination(pageSize: number) {
  return { page: 1, pageSize, total: 0, totalPages: 0, hasMore: false };
}

function buildListInput(params: UseMediaLibraryParams) {
  return {
    type: params.typeFilter,
    sort: params.sortBy,
    search: params.search || undefined,
    genre: params.genreFilter ?? undefined,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export function useMediaLibrary(params: UseMediaLibraryParams) {
  const { data, isLoading, error, refetch } = usePillarQuery<LibraryListResult>(
    'media',
    ['library', 'list'],
    buildListInput(params)
  );

  const { data: genresData } = usePillarQuery<GenresResult>(
    'media',
    ['library', 'genres'],
    undefined
  );

  const total = data?.pagination.total ?? 0;
  const isEmpty = !isLoading && !error && total === 0;

  return {
    items: data?.data ?? [],
    isLoading,
    error,
    refetch,
    isEmpty,
    allGenres: genresData?.data ?? [],
    pagination: data?.pagination ?? buildEmptyPagination(params.pageSize),
  };
}
