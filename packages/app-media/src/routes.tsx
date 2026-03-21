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
const CompareArenaPage = lazy(() =>
  import("./pages/CompareArenaPage").then((m) => ({
    default: m.CompareArenaPage,
  }))
);

/** Shared navigation types (mirrored from shell to avoid circular dependency) */
export interface AppNavItem {
  path: string;
  label: string;
  icon: string;
}

export interface AppNavConfig {
  id: string;
  label: string;
  icon: string;
  color?: "emerald" | "indigo" | "amber" | "rose" | "sky" | "violet";
  basePath: string;
  items: AppNavItem[];
}

export const navConfig: AppNavConfig = {
  id: "media",
  label: "Media",
  icon: "Film",
  color: "indigo",
  basePath: "/media",
  items: [
    { path: "", label: "Library", icon: "Library" },
    { path: "/watchlist", label: "Watchlist", icon: "Bookmark" },
    { path: "/search", label: "Search", icon: "Search" },
    { path: "/compare", label: "Compare", icon: "ArrowLeftRight" },
  ],
};

export const routes: RouteObject[] = [
  { index: true, element: <LibraryPage /> },
  { path: "movies/:id", element: <MovieDetailPage /> },
  { path: "tv/:id", element: <TvShowDetailPage /> },
  { path: "tv/:id/season/:num", element: <SeasonDetailPage /> },
  { path: "watchlist", element: <WatchlistPage /> },
  { path: "search", element: <SearchPage /> },
  { path: "compare", element: <CompareArenaPage /> },
];
