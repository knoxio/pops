/**
 * Media app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-media and mounts them under /media/*.
 */
import { lazy } from "react";
import type { RouteObject } from "react-router";

const LibraryPage = lazy(() =>
  import("./pages/LibraryPage").then((m) => ({ default: m.LibraryPage }))
);
const MovieDetailPage = lazy(() =>
  import("./pages/MovieDetailPage").then((m) => ({
    default: m.MovieDetailPage,
  }))
);
const TvShowDetailPage = lazy(() =>
  import("./pages/TvShowDetailPage").then((m) => ({
    default: m.TvShowDetailPage,
  }))
);
const SeasonDetailPage = lazy(() =>
  import("./pages/SeasonDetailPage").then((m) => ({
    default: m.SeasonDetailPage,
  }))
);
const SearchPage = lazy(() =>
  import("./pages/SearchPage").then((m) => ({ default: m.SearchPage }))
);
const WatchlistPage = lazy(() =>
  import("./pages/WatchlistPage").then((m) => ({
    default: m.WatchlistPage,
  }))
);

/** Local type mirror for compile-time safety (shell owns the canonical types). */
interface AppNavConfigShape {
  id: string;
  label: string;
  icon: string;
  basePath: string;
  items: { path: string; label: string; icon: string }[];
}

export const navConfig = {
  id: "media",
  label: "Media",
  icon: "Film",
  basePath: "/media",
  items: [
    { path: "", label: "Library", icon: "Library" },
    { path: "/watchlist", label: "Watchlist", icon: "Bookmark" },
    { path: "/search", label: "Search", icon: "Search" },
  ],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [
  { index: true, element: <LibraryPage /> },
  { path: "movies/:id", element: <MovieDetailPage /> },
  { path: "tv/:id", element: <TvShowDetailPage /> },
  { path: "tv/:id/season/:num", element: <SeasonDetailPage /> },
  { path: "watchlist", element: <WatchlistPage /> },
  { path: "search", element: <SearchPage /> },
];
