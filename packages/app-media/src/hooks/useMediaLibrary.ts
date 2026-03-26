import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { trpc } from "../lib/trpc";

export type MediaType = "all" | "movie" | "tv";
export type SortOption = "title" | "dateAdded" | "releaseDate" | "rating";
export type PageSize = 24 | 48 | 96;

const VALID_TYPES: MediaType[] = ["all", "movie", "tv"];
const VALID_SORTS: SortOption[] = ["title", "dateAdded", "releaseDate", "rating"];
const VALID_PAGE_SIZES: PageSize[] = [24, 48, 96];

function parseType(val: string | null): MediaType {
  return VALID_TYPES.includes(val as MediaType) ? (val as MediaType) : "all";
}

function parseSort(val: string | null): SortOption {
  return VALID_SORTS.includes(val as SortOption) ? (val as SortOption) : "dateAdded";
}

function parsePageSize(val: string | null): PageSize {
  const num = Number(val);
  return VALID_PAGE_SIZES.includes(num as PageSize) ? (num as PageSize) : 24;
}

function parsePage(val: string | null): number {
  const num = Number(val);
  return Number.isInteger(num) && num > 0 ? num : 1;
}

export function useMediaLibrary() {
  const [searchParams, setSearchParams] = useSearchParams();

  const typeFilter = parseType(searchParams.get("type"));
  const sortBy = parseSort(searchParams.get("sort"));
  const search = searchParams.get("q") ?? "";
  const genreFilter = searchParams.get("genre") ?? null;
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("pageSize"));

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value === null || value === "" || value === "all" || value === "dateAdded") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
        // Reset to page 1 when changing filters/sort
        if (key !== "page") {
          next.delete("page");
        }
        return next;
      });
    },
    [setSearchParams]
  );

  const setTypeFilter = useCallback((type: MediaType) => setParam("type", type), [setParam]);

  const setSortBy = useCallback((sort: SortOption) => setParam("sort", sort), [setParam]);

  const setSearch = useCallback((q: string) => setParam("q", q || null), [setParam]);

  const setGenreFilter = useCallback(
    (genre: string | null) => setParam("genre", genre),
    [setParam]
  );

  const setPage = useCallback(
    (p: number) => setParam("page", p > 1 ? String(p) : null),
    [setParam]
  );

  const setPageSize = useCallback(
    (size: PageSize) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (size === 24) {
          next.delete("pageSize");
        } else {
          next.set("pageSize", String(size));
        }
        next.delete("page");
        return next;
      });
    },
    [setSearchParams]
  );

  const { data, isLoading } = trpc.media.library.list.useQuery({
    type: typeFilter,
    sort: sortBy,
    search: search || undefined,
    genre: genreFilter ?? undefined,
    page,
    pageSize,
  });

  // Extract unique genres from current page (for the genre dropdown, we fetch all items)
  const { data: allMoviesData } = trpc.media.movies.list.useQuery({ limit: 500 });
  const { data: allTvData } = trpc.media.tvShows.list.useQuery({ limit: 500 });

  const allGenres = (() => {
    const genres = new Set<string>();
    for (const m of allMoviesData?.data ?? []) {
      for (const g of (m as { genres: string[] }).genres) genres.add(g);
    }
    for (const s of allTvData?.data ?? []) {
      for (const g of (s as { genres: string[] }).genres) genres.add(g);
    }
    return Array.from(genres).sort();
  })();

  return {
    items: data?.items ?? [],
    isLoading,
    isEmpty: !isLoading && (data?.total ?? 0) === 0,
    total: data?.total ?? 0,
    page: data?.page ?? page,
    pageSize: data?.pageSize ?? pageSize,
    totalPages: data?.totalPages ?? 1,
    allGenres,
    typeFilter,
    setTypeFilter,
    genreFilter,
    setGenreFilter,
    sortBy,
    setSortBy,
    search,
    setSearch,
    setPage,
    setPageSize,
  };
}
