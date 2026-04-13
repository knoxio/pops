/**
 * Media app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-media and mounts them under /media/*.
 */
import { lazy } from 'react';
import type { RouteObject } from 'react-router';

const LibraryPage = lazy(() =>
  import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage }))
);
const MovieDetailPage = lazy(() =>
  import('./pages/MovieDetailPage').then((m) => ({
    default: m.MovieDetailPage,
  }))
);
const TvShowDetailPage = lazy(() =>
  import('./pages/TvShowDetailPage').then((m) => ({
    default: m.TvShowDetailPage,
  }))
);
const SeasonDetailPage = lazy(() =>
  import('./pages/SeasonDetailPage').then((m) => ({
    default: m.SeasonDetailPage,
  }))
);
const SearchPage = lazy(() =>
  import('./pages/SearchPage').then((m) => ({ default: m.SearchPage }))
);
const WatchlistPage = lazy(() =>
  import('./pages/WatchlistPage').then((m) => ({
    default: m.WatchlistPage,
  }))
);
const QuickPickPage = lazy(() =>
  import('./pages/QuickPickPage').then((m) => ({
    default: m.QuickPickPage,
  }))
);
const CompareArenaPage = lazy(() =>
  import('./pages/CompareArenaPage').then((m) => ({
    default: m.CompareArenaPage,
  }))
);
const DiscoverPage = lazy(() =>
  import('./pages/DiscoverPage').then((m) => ({
    default: m.DiscoverPage,
  }))
);
const RankingsPage = lazy(() =>
  import('./pages/RankingsPage').then((m) => ({
    default: m.RankingsPage,
  }))
);
const PlexSettingsPage = lazy(() =>
  import('./pages/PlexSettingsPage').then((m) => ({
    default: m.PlexSettingsPage,
  }))
);
const ArrSettingsPage = lazy(() =>
  import('./pages/ArrSettingsPage').then((m) => ({
    default: m.ArrSettingsPage,
  }))
);
const RotationSettingsPage = lazy(() =>
  import('./pages/RotationSettingsPage').then((m) => ({
    default: m.RotationSettingsPage,
  }))
);
const RotationLogPage = lazy(() =>
  import('./pages/RotationLogPage').then((m) => ({
    default: m.RotationLogPage,
  }))
);
const CandidateQueuePage = lazy(() =>
  import('./pages/CandidateQueuePage').then((m) => ({
    default: m.CandidateQueuePage,
  }))
);
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((m) => ({
    default: m.HistoryPage,
  }))
);
const ComparisonHistoryPage = lazy(() =>
  import('./pages/ComparisonHistoryPage').then((m) => ({
    default: m.ComparisonHistoryPage,
  }))
);
const CalendarPage = lazy(() =>
  import('./pages/CalendarPage').then((m) => ({
    default: m.CalendarPage,
  }))
);
const TierListPage = lazy(() =>
  import('./pages/TierListPage').then((m) => ({
    default: m.TierListPage,
  }))
);
const DebriefPage = lazy(() =>
  import('./pages/DebriefPage').then((m) => ({
    default: m.DebriefPage,
  }))
);
const DebriefResultsPage = lazy(() =>
  import('./pages/DebriefResultsPage').then((m) => ({
    default: m.DebriefResultsPage,
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
  color?: 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky' | 'violet';
  basePath: string;
  items: AppNavItem[];
}

export const navConfig: AppNavConfig = {
  id: 'media',
  label: 'Media',
  icon: 'Film',
  color: 'indigo',
  basePath: '/media',
  items: [
    { path: '', label: 'Library', icon: 'Library' },
    { path: '/watchlist', label: 'Watchlist', icon: 'Bookmark' },
    { path: '/history', label: 'History', icon: 'Clock' },
    { path: '/discover', label: 'Discover', icon: 'Compass' },
    { path: '/rankings', label: 'Rankings', icon: 'Trophy' },
    { path: '/search', label: 'Search', icon: 'Search' },
    { path: '/compare', label: 'Compare', icon: 'ArrowLeftRight' },
    { path: '/tier-list', label: 'Tier List', icon: 'Layers' },
  ],
};

export const routes: RouteObject[] = [
  { index: true, element: <LibraryPage /> },
  { path: 'movies/:id', element: <MovieDetailPage /> },
  { path: 'tv/:id', element: <TvShowDetailPage /> },
  { path: 'tv/:id/season/:num', element: <SeasonDetailPage /> },
  { path: 'watchlist', element: <WatchlistPage /> },
  { path: 'history', element: <HistoryPage /> },
  { path: 'discover', element: <DiscoverPage /> },
  { path: 'rankings', element: <RankingsPage /> },
  { path: 'search', element: <SearchPage /> },
  { path: 'compare', element: <CompareArenaPage /> },
  { path: 'compare/history', element: <ComparisonHistoryPage /> },
  { path: 'quick-pick', element: <QuickPickPage /> },
  { path: 'plex', element: <PlexSettingsPage /> },
  { path: 'arr', element: <ArrSettingsPage /> },
  { path: 'rotation', element: <RotationSettingsPage /> },
  { path: 'rotation/log', element: <RotationLogPage /> },
  { path: 'rotation/candidates', element: <CandidateQueuePage /> },
  { path: 'arr/calendar', element: <CalendarPage /> },
  { path: 'tier-list', element: <TierListPage /> },
  { path: 'debrief/:movieId', element: <DebriefPage /> },
  { path: 'debrief/:movieId/results', element: <DebriefResultsPage /> },
];
